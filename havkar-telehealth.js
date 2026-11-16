/**
 * HAVKAR telehealth WebRTC client (1:1 voice/video).
 * Does not open public clinical sessions without server authorization.
 * Media is never recorded by default. Session tokens must not be logged.
 */
(function (root) {
  "use strict";

  var state = {
    pc: null,
    localStream: null,
    remoteStream: null,
    session: null,
    muted: false,
    cameraOff: false,
    videoDevices: [],
    currentVideoDeviceId: null
  };

  function iceFromSession(session) {
    var ice = (session && session.iceServers) || [{ urls: "stun:stun.l.google.com:19302" }];
    return { iceServers: ice };
  }

  async function listVideoDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    var devices = await navigator.mediaDevices.enumerateDevices();
    state.videoDevices = devices.filter(function (d) {
      return d.kind === "videoinput";
    });
    return state.videoDevices;
  }

  async function getLocalMedia(modality) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("media_devices_unavailable");
    }
    var constraints = {
      audio: true,
      video:
        modality === "video"
          ? {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          : false
    };
    if (state.currentVideoDeviceId && modality === "video") {
      constraints.video = { deviceId: { exact: state.currentVideoDeviceId } };
    }
    state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    await listVideoDevices();
    return state.localStream;
  }

  async function startPeer(session, handlers) {
    handlers = handlers || {};
    if (state.pc) await endCall();
    state.session = session;
    var modality = String((session && session.modality) || "video");
    var local = await getLocalMedia(modality);
    if (handlers.onLocalStream) handlers.onLocalStream(local);

    var pc = new RTCPeerConnection(iceFromSession(session));
    state.pc = pc;
    state.remoteStream = new MediaStream();

    local.getTracks().forEach(function (track) {
      pc.addTrack(track, local);
    });

    pc.ontrack = function (ev) {
      ev.streams[0].getTracks().forEach(function (t) {
        state.remoteStream.addTrack(t);
      });
      if (handlers.onRemoteStream) handlers.onRemoteStream(state.remoteStream);
    };
    pc.onconnectionstatechange = function () {
      if (handlers.onConnectionState) handlers.onConnectionState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = function () {
      if (handlers.onIceState) handlers.onIceState(pc.iceConnectionState);
    };

    return pc;
  }

  async function createOffer() {
    if (!state.pc) throw new Error("peer_not_started");
    var offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    return offer;
  }

  async function acceptRemoteDescription(desc) {
    if (!state.pc) throw new Error("peer_not_started");
    await state.pc.setRemoteDescription(desc);
  }

  async function createAnswer() {
    if (!state.pc) throw new Error("peer_not_started");
    var answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    return answer;
  }

  async function addIceCandidate(candidate) {
    if (!state.pc || !candidate) return;
    await state.pc.addIceCandidate(candidate);
  }

  function setMuted(muted) {
    state.muted = Boolean(muted);
    if (!state.localStream) return state.muted;
    state.localStream.getAudioTracks().forEach(function (t) {
      t.enabled = !state.muted;
    });
    return state.muted;
  }

  function toggleMute() {
    return setMuted(!state.muted);
  }

  function setCameraOff(off) {
    state.cameraOff = Boolean(off);
    if (!state.localStream) return state.cameraOff;
    state.localStream.getVideoTracks().forEach(function (t) {
      t.enabled = !state.cameraOff;
    });
    return state.cameraOff;
  }

  function toggleCamera() {
    return setCameraOff(!state.cameraOff);
  }

  async function switchCamera() {
    if (!state.session || state.session.modality !== "video") return null;
    await listVideoDevices();
    if (state.videoDevices.length < 2) return state.currentVideoDeviceId;
    var ids = state.videoDevices.map(function (d) {
      return d.deviceId;
    });
    var idx = Math.max(0, ids.indexOf(state.currentVideoDeviceId));
    var next = ids[(idx + 1) % ids.length];
    state.currentVideoDeviceId = next;
    var old = state.localStream;
    var neu = await getLocalMedia("video");
    var videoTrack = neu.getVideoTracks()[0];
    if (state.pc && videoTrack) {
      var sender = state.pc.getSenders().find(function (s) {
        return s.track && s.track.kind === "video";
      });
      if (sender) await sender.replaceTrack(videoTrack);
    }
    if (old) old.getTracks().forEach(function (t) {
      if (t.kind === "video") t.stop();
    });
    return next;
  }

  async function endCall() {
    if (state.localStream) {
      state.localStream.getTracks().forEach(function (t) {
        t.stop();
      });
    }
    if (state.pc) {
      try {
        state.pc.close();
      } catch (_e) {}
    }
    state.pc = null;
    state.localStream = null;
    state.remoteStream = null;
    state.session = null;
    state.muted = false;
    state.cameraOff = false;
  }

  root.HAVKAR_TELEHEALTH = {
    startPeer: startPeer,
    createOffer: createOffer,
    createAnswer: createAnswer,
    acceptRemoteDescription: acceptRemoteDescription,
    addIceCandidate: addIceCandidate,
    toggleMute: toggleMute,
    setMuted: setMuted,
    toggleCamera: toggleCamera,
    setCameraOff: setCameraOff,
    switchCamera: switchCamera,
    listVideoDevices: listVideoDevices,
    endCall: endCall,
    getState: function () {
      return {
        muted: state.muted,
        cameraOff: state.cameraOff,
        hasSession: Boolean(state.session),
        connectionState: state.pc ? state.pc.connectionState : "new"
      };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
