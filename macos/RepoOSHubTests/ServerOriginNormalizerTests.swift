import XCTest
@testable import RepoOSHub

final class ServerOriginNormalizerTests: XCTestCase {
    func testNormalizesHostAndDefaultPort() throws {
        let url = try ServerOriginNormalizer.normalizeOriginInput("  HTTPS://Example.com:443/  ")
        XCTAssertEqual(url.absoluteString, "https://example.com")
    }

    func testPreservesNonDefaultPort() throws {
        let url = try ServerOriginNormalizer.normalizeOriginInput("https://localhost:9443")
        XCTAssertEqual(url.port, 9443)
        XCTAssertEqual(url.host, "localhost")
    }

    func testAddsHttpsSchemeWhenMissing() throws {
        let url = try ServerOriginNormalizer.normalizeOriginInput("dev.repoos.test")
        XCTAssertEqual(url.scheme, "https")
        XCTAssertEqual(url.host, "dev.repoos.test")
    }

    func testRejectsHttpScheme() {
        XCTAssertThrowsError(try ServerOriginNormalizer.normalizeOriginInput("http://example.com")) { error in
            XCTAssertEqual(error as? ServerOriginError, .notHTTPS)
        }
    }

    func testRejectsQueryAndPath() {
        XCTAssertThrowsError(try ServerOriginNormalizer.normalizeOriginInput("https://example.com/api")) { error in
            XCTAssertEqual(error as? ServerOriginError, .pathNotAllowed)
        }
        XCTAssertThrowsError(try ServerOriginNormalizer.normalizeOriginInput("https://example.com?x=1")) { error in
            XCTAssertEqual(error as? ServerOriginError, .queryNotAllowed)
        }
    }

    func testValidateDisplayNameLength() throws {
        XCTAssertEqual(try ServerOriginNormalizer.validateDisplayName(" Local "), "Local")
        let long = String(repeating: "a", count: 81)
        XCTAssertThrowsError(try ServerOriginNormalizer.validateDisplayName(long)) { error in
            XCTAssertEqual(error as? ServerOriginError, .nameTooLong)
        }
    }
}
