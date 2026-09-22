import SwiftUI

struct PinTaskContextSheet: View {
    @EnvironmentObject private var appState: HubAppState
    @Environment(\.dismiss) private var dismiss

    let serverID: UUID
    @State private var taskIdentifier = ""
    @State private var errorMessage: String?
    @State private var isPinning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Pin task")
                .font(.title3.weight(.semibold))

            Text("Enter a task number, such as 1 or 0001. RepoOS finds the task and uses its title automatically.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            TextField("Task number", text: $taskIdentifier)
                .accessibilityLabel("Task number")
                .textFieldStyle(.roundedBorder)
                .onSubmit { save() }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(isPinning ? "Pinning…" : "Pin") { save() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(isPinning || taskIdentifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 420)
    }

    private func save() {
        errorMessage = nil
        isPinning = true
        Task {
            let error = await appState.pinTask(serverID: serverID, taskNumber: taskIdentifier)
            isPinning = false
            if let error {
                errorMessage = error
            } else {
                dismiss()
            }
        }
    }
}
