// Draws the App Store icon (1024 px, opaque, no alpha channel) and the launch-screen
// logo from the website's mascot (apps/web/public/icons/maskable-512.png).
//   swift tools/make_icon.swift <source.png> <AppIcon.png> <LaunchLogo.png>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4,
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let source = CGImageSourceCreateImageAtIndex(src, 0, nil)
else {
    FileHandle.standardError.write("usage: make_icon.swift <source.png> <AppIcon.png> <LaunchLogo.png>\n".data(using: .utf8)!)
    exit(1)
}

func render(size: Int, opaque: Bool, inset: CGFloat, to path: String) {
    let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info)!
    ctx.interpolationQuality = .high
    let full = CGRect(x: 0, y: 0, width: size, height: size)
    if opaque {
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(full)
    }
    ctx.draw(source, in: full.insetBy(dx: CGFloat(size) * inset, dy: CGFloat(size) * inset))
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(dest) else { exit(1) }
}

// App Store icons must be opaque; iOS rounds the corners itself.
render(size: 1024, opaque: true, inset: 0.02, to: args[2])
render(size: 480, opaque: false, inset: 0, to: args[3])
