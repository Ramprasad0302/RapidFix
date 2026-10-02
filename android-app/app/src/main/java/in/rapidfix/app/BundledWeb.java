package in.rapidfix.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * The whole RapidFix website ships inside the app (assets/web — the same files
 * deployed to rapidfix.in, copied in by build.sh), plus a snapshot of every
 * service (catalog-snapshot.json). So the app opens and shows services even on
 * the very first launch without internet, and loads faster always:
 *
 *  - Built scripts/styles (/assets/*, content-hashed) come straight from the app.
 *  - Pages and other files come from the network when online (fresh deploys),
 *    and from the app's copy when offline.
 *  - API calls and the service worker script are never answered from here.
 */
final class BundledWeb {
    private static final String ROOT = "web";
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("webp", "image/webp");
        MIME.put("jpg", "image/jpeg");
        MIME.put("ico", "image/x-icon");
        MIME.put("wav", "audio/wav");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("woff2", "font/woff2");
        MIME.put("txt", "text/plain");
    }

    private static volatile Set<String> files;

    private BundledWeb() {}

    /** A response from the app's own copy, or null to let the network answer. */
    static WebResourceResponse respond(Context ctx, Set<String> appHosts, WebResourceRequest req) {
        Uri u = req.getUrl();
        if (!"GET".equalsIgnoreCase(req.getMethod()) || u.getHost() == null || !appHosts.contains(u.getHost())) return null;
        String path = u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath();
        if (path.startsWith("/api/") || path.startsWith("/socket.io") || path.startsWith("/uploads/") || path.equals("/sw.js") || path.startsWith("/.well-known/")) return null;

        Set<String> have = list(ctx);
        String file = path.substring(1);
        boolean hashed = path.startsWith("/assets/");
        boolean exists = !file.isEmpty() && have.contains(file);

        // Content-hashed build files: identical everywhere, so always serve the app's copy when it has it.
        if (hashed) return exists ? open(ctx, file, true) : null;
        if (online(ctx)) return null;
        if (exists) return open(ctx, file, false);
        // Offline page navigation (any app route): the app shell.
        if (req.isForMainFrame() || !file.contains(".")) return have.contains("index.html") ? open(ctx, "index.html", false) : null;
        return null;
    }

    /** The bundled service catalogue (JSON), or null. */
    static String catalogSnapshot(Context ctx) {
        try (InputStream in = ctx.getAssets().open(ROOT + "/catalog-snapshot.json")) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16_384];
            for (int n; (n = in.read(chunk)) > 0; ) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        } catch (IOException e) {
            return null;
        }
    }

    private static WebResourceResponse open(Context ctx, String file, boolean immutable) {
        try {
            InputStream in = ctx.getAssets().open(ROOT + "/" + file, AssetManager.ACCESS_STREAMING);
            String ext = file.contains(".") ? file.substring(file.lastIndexOf('.') + 1).toLowerCase() : "";
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg");
            WebResourceResponse r = new WebResourceResponse(mime, text ? StandardCharsets.UTF_8.name() : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return null;
        }
    }

    private static Set<String> list(Context ctx) {
        Set<String> f = files;
        if (f != null) return f;
        synchronized (BundledWeb.class) {
            if (files == null) {
                Set<String> found = new HashSet<>();
                walk(ctx.getAssets(), ROOT, "", found);
                files = found;
            }
            return files;
        }
    }

    private static void walk(AssetManager am, String dir, String prefix, Set<String> out) {
        try {
            String[] names = am.list(dir);
            if (names == null) return;
            for (String name : names) {
                String child = dir + "/" + name;
                String[] sub = am.list(child);
                if (sub != null && sub.length > 0) walk(am, child, prefix + name + "/", out);
                else out.add(prefix + name);
            }
        } catch (IOException ignored) {
        }
    }

    private static boolean online(Context ctx) {
        ConnectivityManager cm = ctx.getSystemService(ConnectivityManager.class);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
}
