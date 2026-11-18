/**
 * WebRTC store-and-forward relay.
 *
 * Important: WebRTC does not discover nearby phones automatically. Each peer needs
 * an SDP/ICE exchange via a local hotspot signaling server, QR/manual exchange,
 * or an existing data channel. This module deliberately leaves signaling transport
 * injectable so it can work on an isolated LAN without a public internet service.
 */
const PROTOCOL = "bd-disaster-mesh";
const VERSION = 1;
const MAX_PACKET_BYTES = 12 * 1024 * 1024;
const CHUNK_BYTES = 16 * 1024;

// crypto.randomUUID() only exists in secure contexts; a LAN rescue node served over http:// is not one.
const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

const bytes = (value) => new TextEncoder().encode(value);
const toBase64 = (buffer) => {
  let binary = "";
  const data = new Uint8Array(buffer);
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export class MeshRelay {
  constructor({ nodeId = uid(), iceServers = [], onPacket = () => {}, onPeer = () => {}, onError = console.error } = {}) {
    this.nodeId = nodeId;
    this.iceServers = iceServers; // [] on an isolated LAN; STUN/TURN from /api/ice-servers when online
    this.onPacket = onPacket;
    this.onPeer = onPeer;
    this.onError = onError;
    this.peers = new Map();
    this.seen = new Map();
    this.pendingChunks = new Map();
    this.closed = false;
  }

  createOffer(peerId) {
    return this.#createPeer(peerId, true);
  }

  async acceptOffer(peerId, offer) {
    const pc = this.#newConnection(peerId);
    pc.ondatachannel = (event) => this.#attachChannel(peerId, event.channel);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.#waitForIce(pc);
    return pc.localDescription;
  }

  async acceptAnswer(peerId, answer) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Unknown peer: ${peerId}`);
    await peer.pc.setRemoteDescription(answer);
  }

  async addIceCandidate(peerId, candidate) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Unknown peer: ${peerId}`);
    await peer.pc.addIceCandidate(candidate);
  }

  async #createPeer(peerId, initiator) {
    const pc = this.#newConnection(peerId);
    if (initiator) this.#attachChannel(peerId, pc.createDataChannel("bd-mesh-v1", { ordered: true }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.#waitForIce(pc);
    return pc.localDescription;
  }

  #newConnection(peerId) {
    if (this.closed) throw new Error("MeshRelay is closed.");
    if (!peerId || peerId === this.nodeId) throw new Error("A distinct peerId is required.");
    this.peers.get(peerId)?.pc.close();

    // For same-hotspot/LAN-only use, configure an ICE server reachable on that LAN
    // (for example, a self-hosted coturn). Public STUN is optional and not offline.
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { pc, channel: null };
    this.peers.set(peerId, peer);

    pc.onconnectionstatechange = () => {
      this.onPeer({ peerId, state: pc.connectionState });
      if (["failed", "closed"].includes(pc.connectionState)) this.#dropPeer(peerId);
    };
    pc.onicecandidateerror = (event) => this.onError(new Error(`ICE candidate error: ${event.errorText || "unknown"}`));
    return pc;
  }

  #attachChannel(peerId, channel) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => this.onPeer({ peerId, state: "connected" });
    channel.onclose = () => this.onPeer({ peerId, state: "disconnected" });
    channel.onerror = (e) => this.onError(e);
    channel.onmessage = (event) => this.#receive(peerId, event.data).catch(this.onError);
  }

  #waitForIce(pc, timeoutMs = 8000) {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // An unreachable STUN server can stall gathering; proceed if we already have usable candidates.
        if (pc.localDescription?.sdp?.includes("a=candidate")) resolve();
        else reject(new Error("ICE gathering timed out; check local network and signaling."));
      }, timeoutMs);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  async send(payload, { ttl = 8, priority = "normal" } = {}) {
    const packet = {
      protocol: PROTOCOL, version: VERSION,
      id: uid(), origin: this.nodeId, sender: this.nodeId,
      createdAt: Date.now(), ttl, hops: 0, priority,
      payload
    };
    this.#remember(packet.id);
    await this.#forward(packet, null);
    return packet.id;
  }

  async #receive(fromPeerId, raw) {
    let packet;
    if (typeof raw === "string") {
      packet = JSON.parse(raw);
    } else {
      packet = JSON.parse(new TextDecoder().decode(raw));
    }
    if (packet?.protocol !== PROTOCOL || packet.version !== VERSION || !packet.id) return;
    if (packet.origin === this.nodeId || this.seen.has(packet.id)) return;
    if (Date.now() - packet.createdAt > 24 * 60 * 60 * 1000) return;
    this.#remember(packet.id);
    packet.sender = this.nodeId;
    packet.hops = Number(packet.hops || 0) + 1;
    this.onPacket({ ...packet, receivedFrom: fromPeerId });
    if (packet.ttl > 0) {
      packet.ttl -= 1;
      await this.#forward(packet, fromPeerId);
    }
  }

  async #forward(packet, exceptPeerId) {
    const encoded = JSON.stringify(packet);
    const size = bytes(encoded).byteLength;
    if (size > MAX_PACKET_BYTES) throw new Error("Packet exceeds configured 12 MB limit. Send media using chunked transfer.");
    const sendable = [...this.peers.entries()].filter(([id, peer]) =>
      id !== exceptPeerId && peer.channel?.readyState === "open"
    );
    for (const [, peer] of sendable) {
      try { peer.channel.send(encoded); } catch (e) { this.onError(e); }
    }
  }

  #remember(id) {
    this.seen.set(id, Date.now());
    if (this.seen.size > 5000) {
      const oldest = [...this.seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000);
      oldest.forEach(([key]) => this.seen.delete(key));
    }
  }

  async sendBlob(blob, metadata = {}, { ttl = 8 } = {}) {
    if (!(blob instanceof Blob)) throw new TypeError("sendBlob expects a Blob.");
    if (blob.size > MAX_PACKET_BYTES) throw new Error("Media file exceeds 12 MB; compress or split at the application layer.");
    const transferId = uid();
    const count = Math.ceil(blob.size / CHUNK_BYTES);
    await this.send({ type: "media-start", transferId, count, size: blob.size, mime: blob.type, metadata }, { ttl });
    for (let index = 0; index < count; index++) {
      const chunk = await blob.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer();
      await this.send({ type: "media-chunk", transferId, index, data: toBase64(chunk) }, { ttl });
    }
    await this.send({ type: "media-end", transferId }, { ttl });
    return transferId;
  }

  // Optional helper for a receiving application to reconstruct media from relayed chunks.
  acceptMediaPacket(packet) {
    const p = packet?.payload;
    if (!p?.transferId) return null;
    if (p.type === "media-start") {
      this.pendingChunks.set(p.transferId, { ...p, chunks: new Array(p.count) });
      return null;
    }
    const transfer = this.pendingChunks.get(p.transferId);
    if (!transfer) return null;
    if (p.type === "media-chunk") {
      const binary = atob(p.data);
      const buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      transfer.chunks[p.index] = buffer;
      return null;
    }
    if (p.type === "media-end") {
      if (transfer.chunks.some((chunk) => !chunk)) return null;
      const blob = new Blob(transfer.chunks, { type: transfer.mime });
      this.pendingChunks.delete(p.transferId);
      return { blob, metadata: transfer.metadata, transferId: p.transferId };
    }
    return null;
  }

  #dropPeer(peerId) {
    const peer = this.peers.get(peerId);
    peer?.pc.close();
    this.peers.delete(peerId);
  }

  close() {
    this.closed = true;
    for (const peerId of this.peers.keys()) this.#dropPeer(peerId);
    this.seen.clear();
    this.pendingChunks.clear();
  }
}
