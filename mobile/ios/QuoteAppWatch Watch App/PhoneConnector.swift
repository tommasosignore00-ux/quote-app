import WatchConnectivity
import Combine

class PhoneConnector: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isRecording = false
    @Published var isReachable = false
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
    
    func toggleRecording() {
        let nextRecordingState = !isRecording
        let command = isRecording ? "stop_recording" : "start_recording"
        let payload: [String: Any] = ["action": command]
        let session = WCSession.default

        if session.activationState != .activated {
            session.activate()
        }

        if session.isReachable {
            session.sendMessage(
                payload,
                replyHandler: { reply in
                    DispatchQueue.main.async {
                        self.isRecording = reply["recording"] as? Bool ?? nextRecordingState
                    }
                },
                errorHandler: { error in
                    print("Watch send error: \(error)")
                    self.queueApplicationContext(payload)
                    DispatchQueue.main.async {
                        self.isRecording = nextRecordingState
                    }
                }
            )
        } else {
            queueApplicationContext(payload)
            DispatchQueue.main.async {
                self.isRecording = nextRecordingState
            }
        }
    }

    private func queueApplicationContext(_ payload: [String: Any]) {
        do {
            try WCSession.default.updateApplicationContext(payload)
        } catch {
            print("Watch context update error: \(error)")
        }
    }
    
    // MARK: - WCSessionDelegate
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let recording = message["recording"] as? Bool {
            DispatchQueue.main.async {
                self.isRecording = recording
            }
        }
    }
}
