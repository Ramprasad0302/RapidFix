import Foundation
import WebKit
import UniformTypeIdentifiers

/**
 * The whole RapidFix website ships inside the app (Resources/web — the same files
 * deployed to rapidfix.in, copied in by build.sh), plus a snapshot of every
 * service (catalog-snapshot.json). Served at rapidfix-app://app/… when the live
 * site can't be reached and nothing is saved yet, so even the very first launch
 * without internet shows the services.
 */
final class BundledWeb: NSObject, WKURLSchemeHandler {
    static let scheme = "rapidfix-app"
    private static let root = Bundle.main.url(forResource: "web", withExtension: nil)

    static var available: Bool {
        guard let root else { return false }
        return FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path)
    }

    /** The bundled service catalogue (JSON), or nil. */
    static func catalogSnapshot() -> String? {
        guard let u = root?.appendingPathComponent("catalog-snapshot.json") else { return nil }
        return try? String(contentsOf: u, encoding: .utf8)
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let root = Self.root else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        var file = root.appendingPathComponent(path).standardizedFileURL
        // Never outside the bundled folder; any app route (no file extension) gets the app shell.
        let inside = file.path.hasPrefix(root.standardizedFileURL.path + "/")
        if !inside || !FileManager.default.fileExists(atPath: file.path) {
            guard !path.contains(".") else { return task.didFailWithError(URLError(.fileDoesNotExist)) }
            file = root.appendingPathComponent("index.html")
        }
        guard let data = try? Data(contentsOf: file) else { return task.didFailWithError(URLError(.cannotOpenFile)) }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
