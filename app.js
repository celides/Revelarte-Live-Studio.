/**
 * Revelarte Live Studio — Lógica de videoconferencia
 * 
 * Arquitectura:
 * - El terapeuta (admin) es el "peer" que inicia la sesión.
 * - El paciente se conecta usando el ID generado por el terapeuta.
 * - El terapeuta tiene control total sobre video/audio remoto.
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================

// Configuración de PeerJS (usando el servidor gratuito de PeerJS Cloud)
// Para producción, considera usar tu propio servidor de señalización
const PEER_CONFIG = {
    // Servidor gratuito de PeerJS — sin configuración adicional
    // En producción usa: { host: 'tu-servidor.com', port: 443, secure: true }
};

// ============================================================
// ESTADO DE LA APLICACIÓN
// ============================================================

const state = {
    peer: null,
    myPeerId: null,
    currentCall: null,
    remoteStream: null,
    remotePeerId: null,

    // Estados locales del terapeuta
    localVideoEnabled: true,
    localAudioEnabled: true,

    // Estados remotos (control del terapeuta sobre el paciente)
    remoteVideoEnabled: true,
    remoteAudioEnabled: true,

    isConnected: false,
    isCallActive: false,
};

// ============================================================
// ELEMENTOS DEL DOM
// ============================================================

const elements = {
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    myPeerId: document.getElementById('myPeerId'),
    remotePeerIdLabel: document.getElementById('remotePeerIdLabel'),
    connectionDot: document.getElementById('connectionDot'),
    connectionStatus: document.getElementById('connectionStatus'),
    statusBadge: document.getElementById('statusBadge'),

    // Botones
    toggleLocalVideo: document.getElementById('toggleLocalVideo'),
    toggleLocalAudio: document.getElementById('toggleLocalAudio'),
    toggleRemoteVideo: document.getElementById('toggleRemoteVideo'),
    toggleRemoteAudio: document.getElementById('toggleRemoteAudio'),
    endCall: document.getElementById('endCall'),
};

// ============================================================
// FUNCIONES PRINCIPALES
// ============================================================

/**
 * Inicializa la aplicación — se ejecuta al cargar la página
 */
async function init() {
    try {
        // 1. Solicitar acceso a la cámara y micrófono
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        // 2. Mostrar video local
        elements.localVideo.srcObject = stream;

        // 3. Crear el peer (terapeuta)
        state.peer = new Peer(null, PEER_CONFIG);

        // 4. Manejar eventos del peer
        setupPeerEvents();

        // 5. Configurar botones
        setupButtons();

        // 6. Actualizar UI
        updateUI();

        console.log('✅ Revelarte Live Studio inicializado correctamente');

    } catch (error) {
        console.error('❌ Error al inicializar:', error);
        elements.statusBadge.textContent = '❌ Error: Permisos de cámara denegados';
        elements.statusBadge.style.borderColor = '#e74c3c';
        elements.statusBadge.style.color = '#e74c3c';
        alert('Por favor, permite el acceso a la cámara y micrófono para continuar.');
    }
}

/**
 * Configura los eventos del Peer
 */
function setupPeerEvents() {
    // Cuando el peer se abre y obtiene un ID
    state.peer.on('open', (id) => {
        state.myPeerId = id;
        elements.myPeerId.textContent = id;
        elements.statusBadge.textContent = '🟢 Sesión activa — Comparte tu ID con el paciente';
        elements.statusBadge.style.borderColor = '#2ecc71';
        elements.statusBadge.style.color = '#2ecc71';
        updateConnectionStatus(true);
        console.log(`🆔 Mi Peer ID: ${id}`);
    });

    // Manejar llamadas entrantes (cuando el paciente se conecta)
    state.peer.on('call', (call) => {
        console.log('📞 Llamada entrante del paciente:', call.peer);

        // Aceptar la llamada
        const localStream = elements.localVideo.srcObject;
        call.answer(localStream);

        // Manejar la transmisión remota
        call.on('stream', (remoteStream) => {
            state.remoteStream = remoteStream;
            state.remotePeerId = call.peer;
            elements.remoteVideo.srcObject = remoteStream;
            elements.remotePeerIdLabel.textContent = `🧘 Paciente conectado: ${call.peer.substring(0, 8)}...`;
            state.isCallActive = true;
            updateUI();
            console.log('📡 Stream remoto recibido');
        });

        // Manejar errores
        call.on('error', (error) => {
            console.error('❌ Error en llamada:', error);
            handleDisconnection();
        });

        // Manejar cierre de llamada
        call.on('close', () => {
            console.log('📞 Llamada cerrada por el paciente');
            handleDisconnection();
        });

        state.currentCall = call;
    });

    // Manejar errores del peer
    state.peer.on('error', (error) => {
        console.error('❌ Error del Peer:', error);
        if (error.type === 'unavailable-id') {
            // El ID ya estaba en uso, pero nosotros no estamos usando IDs fijos
        }
    });

    // Manejar desconexión del peer
    state.peer.on('disconnected', () => {
        console.log('⚠️ Peer desconectado');
        handleDisconnection();
    });
}

/**
 * Configura los botones de control
 */
function setupButtons() {
    // --- LOCAL: Video ---
    elements.toggleLocalVideo.addEventListener('click', () => {
        state.localVideoEnabled = !state.localVideoEnabled;
        const localStream = elements.localVideo.srcObject;
        if (localStream) {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = state.localVideoEnabled;
            });
        }
        updateLocalControls();
        console.log(`📹 Video local: ${state.localVideoEnabled ? 'ON' : 'OFF'}`);
    });

    // --- LOCAL: Audio ---
    elements.toggleLocalAudio.addEventListener('click', () => {
        state.localAudioEnabled = !state.localAudioEnabled;
        const localStream = elements.localVideo.srcObject;
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = state.localAudioEnabled;
            });
        }
        updateLocalControls();
        console.log(`🎤 Audio local: ${state.localAudioEnabled ? 'ON' : 'OFF'}`);
    });

    // --- REMOTO: Video (control del terapeuta sobre el paciente) ---
    elements.toggleRemoteVideo.addEventListener('click', () => {
        if (!state.isCallActive || !state.currentCall) {
            alert('No hay una sesión activa con un paciente.');
            return;
        }
        state.remoteVideoEnabled = !state.remoteVideoEnabled;
        // Enviamos un mensaje al peer remoto para que apague/encienda su video
        sendRemoteControl('video', state.remoteVideoEnabled);
        updateRemoteControls();
        console.log(`📹 Control remoto: Video ${state.remoteVideoEnabled ? 'ON' : 'OFF'}`);
    });

    // --- REMOTO: Audio (control del terapeuta sobre el paciente) ---
    elements.toggleRemoteAudio.addEventListener('click', () => {
        if (!state.isCallActive || !state.currentCall) {
            alert('No hay una sesión activa con un paciente.');
            return;
        }
        state.remoteAudioEnabled = !state.remoteAudioEnabled;
        // Enviamos un mensaje al peer remoto para que silencie/active su audio
        sendRemoteControl('audio', state.remoteAudioEnabled);
        updateRemoteControls();
        console.log(`🎤 Control remoto: Audio ${state.remoteAudioEnabled ? 'ON' : 'OFF'}`);
    });

    // --- TERMINAR LLAMADA ---
    elements.endCall.addEventListener('click', () => {
        if (state.currentCall) {
            state.currentCall.close();
            state.currentCall = null;
        }
        handleDisconnection();
        console.log('📞 Sesión terminada por el terapeuta');
    });
}

/**
 * Envía un comando de control remoto al paciente
 * @param {string} type - 'video' o 'audio'
 * @param {boolean} enabled - true para encender, false para apagar
 */
function sendRemoteControl(type, enabled) {
    if (!state.currentCall) {
        console.warn('⚠️ No hay llamada activa para enviar control remoto');
        return;
    }

    // Usamos el canal de datos (DataConnection) para enviar comandos
    // Primero verificamos si ya tenemos una conexión de datos
    const dataConnection = state.currentCall.dataConnection;

    if (dataConnection && dataConnection.open) {
        dataConnection.send({
            type: 'control',
            target: type,
            enabled: enabled,
        });
        console.log(`📡 Comando enviado: ${type} → ${enabled ? 'ON' : 'OFF'}`);
    } else {
        // Si no hay DataConnection, la creamos
        const dataConn = state.peer.connect(state.remotePeerId, {
            reliable: true,
        });

        dataConn.on('open', () => {
            dataConn.send({
                type: 'control',
                target: type,
                enabled: enabled,
            });
        });

        // Guardamos la conexión de datos en la llamada
        state.currentCall.dataConnection = dataConn;
        console.log('🔗 Canal de datos establecido para control remoto');
    }
}

/**
 * Maneja la desconexión del paciente
 */
function handleDisconnection() {
    state.isConnected = false;
    state.isCallActive = false;
    state.remoteStream = null;
    state.remotePeerId = null;
    state.currentCall = null;

    elements.remoteVideo.srcObject = null;
    elements.remotePeerIdLabel.textContent = '🧘 Esperando paciente...';
    updateConnectionStatus(false);
    updateUI();

    // Reiniciar el estado remoto
    state.remoteVideoEnabled = true;
    state.remoteAudioEnabled = true;
    updateRemoteControls();

    elements.statusBadge.textContent = '🔌 Desconectado — Esperando paciente';
    elements.statusBadge.style.borderColor = '#e74c3c';
    elements.statusBadge.style.color = '#e74c3c';
}

// ============================================================
// FUNCIONES DE UI
// ============================================================

/**
 * Actualiza el estado de la conexión
 */
function updateConnectionStatus(isConnected) {
    state.isConnected = isConnected;
    if (isConnected) {
        elements.connectionDot.className = 'dot online';
        elements.connectionStatus.textContent = 'Conectado';
        elements.connectionStatus.style.color = '#2ecc71';
    } else {
        elements.connectionDot.className = 'dot offline';
        elements.connectionStatus.textContent = 'Desconectado';
        elements.connectionStatus.style.color = '#e74c3c';
    }
}

/**
 * Actualiza los controles locales
 */
function updateLocalControls() {
    elements.toggleLocalVideo.classList.toggle('active', state.localVideoEnabled);
    elements.toggleLocalAudio.classList.toggle('active', state.localAudioEnabled);
}

/**
 * Actualiza los controles remotos
 */
function updateRemoteControls() {
    elements.toggleRemoteVideo.classList.toggle('active', state.remoteVideoEnabled);
    elements.toggleRemoteAudio.classList.toggle('active', state.remoteAudioEnabled);
}

/**
 * Actualiza toda la UI
 */
function updateUI() {
    updateLocalControls();
    updateRemoteControls();
}

// ============================================================
// MANEJO DE DATOS EN EL PACIENTE (lado remoto)
// 
// NOTA: Esta es la lógica que correría en el navegador del paciente.
// Para simplificar, la incluimos aquí pero en producción la tendrías
// en un archivo separado (patient.html + patient.js)
// ============================================================

/**
 * Esta función sería ejecutada por el paciente para recibir comandos del terapeuta
 */
function setupPatientDataHandler(peer, call) {
    // El paciente escucha comandos del terapeuta
    const dataConn = peer.connect(call.peer, { reliable: true });

    dataConn.on('open', () => {
        console.log('🔗 Canal de datos abierto (paciente)');
    });

    dataConn.on('data', (data) => {
        if (data.type === 'control') {
            const { target, enabled } = data;
            if (target === 'video') {
                // El paciente apaga/enciende su video
                const localStream = document.getElementById('localVideo').srcObject;
                if (localStream) {
                    localStream.getVideoTracks().forEach(track => {
                        track.enabled = enabled;
                    });
                }
                console.log(`📹 Paciente: Video ${enabled ? 'ON' : 'OFF'} (control remoto)`);
            } else if (target === 'audio') {
                // El paciente apaga/enciende su audio
                const localStream = document.getElementById('localVideo').srcObject;
                if (localStream) {
                    localStream.getAudioTracks().forEach(track => {
                        track.enabled = enabled;
                    });
                }
                console.log(`🎤 Paciente: Audio ${enabled ? 'ON' : 'OFF'} (control remoto)`);
            }
            // Actualizar UI del paciente
            // (no implementado aquí porque es código del terapeuta)
        }
    });
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

// Ejecutar la inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);

// ============================================================
// EXPORTAR PARA DEPURACIÓN
// ============================================================

console.log('🚀 Revelarte Live Studio cargado');
console.log('📖 Para uso:');
console.log('  1. El terapeuta abre esta página.');
console.log('  2. Comparte su Peer ID con el paciente.');
console.log('  3. El paciente se conecta usando el ID.');
console.log('  4. El terapeuta tiene control remoto sobre video/audio del paciente.');
