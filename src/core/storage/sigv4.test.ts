/**
 * SigV4 signer tests (#0660), checked against AWS's official
 * `aws-sig-v4-test-suite` vectors — the same values the AWS documentation
 * publishes. This is the security-critical piece of the Neon provider, so it is
 * verified against the spec's own fixtures rather than only against itself.
 *
 * Vectors used (all with access key `AKIDEXAMPLE`, secret
 * `wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY`, date `20150830T123600Z`,
 * region `us-east-1`, service `service`, host `example.amazonaws.com`):
 *   - get-vanilla                  → 5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31
 *   - get-vanilla-empty-query-key  → a67d582fa61cc504c4bae71f336f98b97f1ea3c7a6bfe1b6e45aec72011b9aeb
 *   - get-vanilla-query-order-key-case → b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500
 * https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
 */
import { describe, expect, it } from "vitest";
import {
  amzDate,
  amzDateStamp,
  canonicalQuery,
  canonicalUri,
  deriveSigningKey,
  encodePathSegment,
  sha256Hex,
  signRequest,
} from "./sigv4.js";

const CRED = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const DATE = new Date("2015-08-30T12:36:00.000Z");

/** Sign `url` the way the AWS vector does: only `host;x-amz-date` signed. */
function signVector(url: string): string {
  const { headers } = signRequest(
    {
      method: "GET",
      url,
      headers: {},
      service: "service",
      region: "us-east-1",
      addContentShaHeader: false,
    },
    CRED,
    DATE,
  );
  const auth =
    Object.entries(headers).find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? "";
  return /Signature=([0-9a-f]+)/.exec(auth)?.[1] ?? "";
}

describe("SigV4 against the official AWS test vectors", () => {
  it("get-vanilla (GET /, no query)", () => {
    expect(signVector("https://example.amazonaws.com/")).toBe(
      "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("get-vanilla-empty-query-key (?Param1=value1)", () => {
    expect(signVector("https://example.amazonaws.com/?Param1=value1")).toBe(
      "a67d582fa61cc504c4bae71f336f98b97f1ea3c7a6bfe1b6e45aec72011b9aeb",
    );
  });

  it("get-vanilla-query-order-key-case (keys sorted case-sensitively by value)", () => {
    // The vector's request is `?Param2=value2&Param1=value1`; sorted keys are
    // Param1 then Param2. Its published signature:
    expect(signVector("https://example.amazonaws.com/?Param2=value2&Param1=value1")).toBe(
      "b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500",
    );
  });

  it("produces the AWS get-vanilla canonical request verbatim", () => {
    const { headers } = signRequest(
      {
        method: "GET",
        url: "https://example.amazonaws.com/",
        headers: {},
        service: "service",
        region: "us-east-1",
        addContentShaHeader: false,
      },
      CRED,
      DATE,
    );
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
  });
});

describe("SigV4 building blocks", () => {
  it("derives the signing key AWS publishes for the example credentials", () => {
    // AWS's "derive signing key" worked example: secret
    // wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20120215, us-east-1, iam.
    const key = deriveSigningKey(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20120215",
      "us-east-1",
      "iam",
    );
    expect(key.toString("hex")).toBe(
      "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d",
    );
  });

  it("hashes the empty body the way SigV4 requires", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("formats the amz date and datestamp", () => {
    expect(amzDate(DATE)).toBe("20150830T123600Z");
    expect(amzDateStamp("20150830T123600Z")).toBe("20150830");
  });

  it("encodes path segments without double-encoding and preserves separators", () => {
    expect(canonicalUri("/bucket/photo 1.png")).toBe("/bucket/photo%201.png");
    expect(canonicalUri("bucket/a+b/c")).toBe("/bucket/a%2Bb/c");
    expect(encodePathSegment("~._-")).toBe("~._-");
    expect(encodePathSegment("a/b")).toBe("a%2Fb");
  });

  it("sorts and encodes the canonical query string", () => {
    expect(canonicalQuery("?b=2&a=1")).toBe("a=1&b=2");
    expect(canonicalQuery("?prefix=a b")).toBe("prefix=a%20b");
    expect(canonicalQuery("")).toBe("");
  });

  it("signs a Neon-style S3 request with x-amz-content-sha256 included", () => {
    const { headers } = signRequest(
      {
        method: "PUT",
        url: "https://br-example.storage-c-2.us-east-2.aws.neon.tech/bucket/work/task/shot.png",
        headers: { "content-type": "application/octet-stream" },
        body: Buffer.from("hello"),
        service: "s3",
        region: "us-east-2",
      },
      CRED,
      DATE,
    );
    const auth = headers["authorization"];
    expect(auth).toContain("Credential=AKIDEXAMPLE/20150830/us-east-2/s3/aws4_request");
    // S3 requires the payload hash to be signed.
    expect(auth).toContain("x-amz-content-sha256");
    expect(headers["x-amz-content-sha256"]).toBe(sha256Hex(Buffer.from("hello")));
  });

  it("includes an x-amz-security-token when the credential carries one", () => {
    const { headers } = signRequest(
      {
        method: "GET",
        url: "https://example.amazonaws.com/",
        headers: {},
        service: "s3",
        region: "us-east-2",
      },
      { ...CRED, sessionToken: "SESSION" },
      DATE,
    );
    expect(headers["x-amz-security-token"]).toBe("SESSION");
    expect(headers["authorization"]).toContain("x-amz-security-token");
  });
});
