import SwiftUI
import WatchConnectivity

struct ContentView: View {
    @StateObject private var connector = PhoneConnector()
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: connector.isRecording ? "mic.fill" : "mic")
                .font(.system(size: 48))
                .foregroundColor(connector.isRecording ? .red : .blue)
            
            Button(action: {
                connector.toggleRecording()
            }) {
                Text(connector.isRecording ? "Stop" : "Registra")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(connector.isRecording ? .red : .blue)
            
            if !connector.isReachable {
                Text("iPhone non raggiungibile")
                    .font(.caption)
                    .foregroundColor(.orange)
            }
        }
    }
}
