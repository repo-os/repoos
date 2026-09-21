import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationSplitView {
            List {
                Label("Workspace", systemImage: "rectangle.3.group")
                    .listItemTint(.accent)
            }
            .navigationTitle("RepoOS Hub")
        } detail: {
            VStack(spacing: 18) {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(.tint)

                Text("Your workspace is ready")
                    .font(.title2.weight(.semibold))

                Text("The native Hub shell is installed. Server connections will appear here in a later release.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: 420)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
            .navigationTitle("Workspace")
        }
    }
}

#Preview {
    ContentView()
}
