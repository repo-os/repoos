import SwiftUI

struct ServerEditorSheet: View {
    @EnvironmentObject private var appState: HubAppState
    @Environment(\.dismiss) private var dismiss

    let model: ServerEditorSheetModel
    @State private var draft: ServerEditorDraft
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name, origin, group, icon, color
    }

    init(model: ServerEditorSheetModel) {
        self.model = model
        _draft = State(initialValue: ServerEditorDraft(mode: model.mode))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.title2.weight(.semibold))

            Text(addsServer
                ? "Paste a RepoOS server address. We’ll infer the connection and check it before saving."
                : "Update this server’s name and sidebar appearance.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Form {
                if addsServer {
                    TextField("Server URL", text: $draft.originText, prompt: Text("localhost:7171 or repo.example.com"))
                        .focused($focusedField, equals: .origin)
                } else {
                    TextField("Display name", text: $draft.name)
                        .focused($focusedField, equals: .name)
                    TextField("Server origin", text: $draft.originText)
                        .focused($focusedField, equals: .origin)
                    TextField("Group (optional)", text: $draft.groupName)
                        .focused($focusedField, equals: .group)
                    TextField("SF Symbol name (optional)", text: $draft.iconSymbolName)
                        .focused($focusedField, equals: .icon)
                    TextField("Accent color hex (optional)", text: $draft.accentColorHex)
                        .focused($focusedField, equals: .color)
                    Toggle("Pin in sidebar", isOn: $draft.isPinned)
                }
            }
            .formStyle(.grouped)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.callout)
                    .accessibilityLabel("Error: \(errorMessage)")
            }

            HStack {
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button(primaryActionTitle) {
                    Task { await save() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(appState.isPerformingHealthCheck)
            }
        }
        .padding(24)
        .frame(width: 460)
        .onAppear {
            focusedField = addsServer ? .origin : .name
        }
    }

    private var title: String {
        switch model.mode {
        case .add: return "Add server"
        case .edit: return "Edit server"
        }
    }

    private var primaryActionTitle: String {
        appState.isPerformingHealthCheck ? "Checking…" : (addsServer ? "Add server" : "Save")
    }

    private var addsServer: Bool {
        if case .add = model.mode { return true }
        return false
    }

    private func save() async {
        errorMessage = await appState.saveFromEditor(draft)
        if errorMessage == nil {
            dismiss()
        }
    }
}
