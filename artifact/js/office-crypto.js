/* 암호 걸린 엑셀(.xlsx) 해제 — UHC NIGHT AUDIT SEOCHO 관리자용 V0.61에서 그대로 복사. forge 필요. */
(function (G) {
const OPS = G.OPS = G.OPS || {};


function u8concat(arrs) {
let total = 0;
arrs.forEach(a => total += a.length);
const out = new Uint8Array(total);
let off = 0;
arrs.forEach(a => {
out.set(a, off);
off += a.length;
});
return out;
}

function safeRawEncode(bytesU8) {
const CHUNK = 32768;
if (bytesU8.length <= CHUNK) return String.fromCharCode.apply(null, bytesU8);
let out = "";
for (let i = 0; i < bytesU8.length; i += CHUNK) {
out += String.fromCharCode.apply(null, bytesU8.subarray(i, Math.min(i + CHUNK, bytesU8.length)));
}
return out;
}

function u32le(n) {
const b = new Uint8Array(4);
new DataView(b.buffer).setUint32(0, n, true);
return b;
}

function fitKeyLen(u8, len) {
if (u8.length === len) return u8;
if (u8.length > len) return u8.slice(0, len);
const out = new Uint8Array(len);
out.fill(54);
out.set(u8, 0);
return out;
}

const AGILE_BLOCK_VERIFIER_INPUT = new Uint8Array([ 254, 167, 210, 118, 59, 75, 158, 121 ]);

const AGILE_BLOCK_VERIFIER_VALUE = new Uint8Array([ 215, 170, 15, 109, 48, 97, 52, 78 ]);

const AGILE_BLOCK_KEY_VALUE = new Uint8Array([ 20, 110, 11, 231, 171, 172, 208, 214 ]);

function b64ToU8(b64str) {
return forge.util.binary.raw.decode(forge.util.decode64(b64str));
}

function agileHash(algo, ...u8s) {
const md = algo === "SHA-512" ? forge.md.sha512.create() : forge.md.sha1.create();
u8s.forEach(u => md.update(safeRawEncode(u)));
return forge.util.binary.raw.decode(md.digest().getBytes());
}

function aesCbcDecryptRaw(keyU8, ivU8, dataU8) {
const decipher = forge.cipher.createDecipher("AES-CBC", safeRawEncode(keyU8));
decipher.start({
iv: safeRawEncode(ivU8)
});
decipher.update(forge.util.createBuffer(safeRawEncode(dataU8)));
return forge.util.binary.raw.decode(decipher.output.getBytes());
}

function parseEncryptionInfoXml(xmlStr) {
const keyDataMatch = xmlStr.match(/<keyData ([^>]+)\/>/);
const encKeyMatch = xmlStr.match(/<p:encryptedKey ([^>]+)\/>/);
if (!keyDataMatch || !encKeyMatch) throw new Error("UNSUPPORTED_ENCRYPTION");
function attrs(s) {
const o = {};
const re = /(\w+)="([^"]*)"/g;
let m;
while (m = re.exec(s)) o[m[1]] = m[2];
return o;
}
return {
keyData: attrs(keyDataMatch[1]),
encryptedKey: attrs(encKeyMatch[1])
};
}

function utf16leBytes(str) {
const out = new Uint8Array(str.length * 2);
const dv = new DataView(out.buffer);
for (let i = 0; i < str.length; i++) dv.setUint16(i * 2, str.charCodeAt(i), true);
return out;
}

function getCfbStream(cfb, name) {
const re = new RegExp("(^|/)" + name + "$");
const idx = cfb.FullPaths.findIndex(p => re.test(p));
if (idx < 0) return null;
const content = cfb.FileIndex[idx].content;
return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function sha1U8(...u8s) {
const md = forge.md.sha1.create();
u8s.forEach(u => md.update(safeRawEncode(u)));
return forge.util.binary.raw.decode(md.digest().getBytes());
}

function aesEcbDecryptRaw(keyU8, dataU8) {
const decipher = forge.cipher.createDecipher("AES-ECB", safeRawEncode(keyU8));
decipher.start({});
decipher.update(forge.util.createBuffer(safeRawEncode(dataU8)));
return forge.util.binary.raw.decode(decipher.output.getBytes());
}

function standardDeriveKey(hIterated, keyBytesLen) {
const hFinal = sha1U8(hIterated, u32le(0));
const buf36 = new Uint8Array(64);
buf36.fill(54);
const buf5c = new Uint8Array(64);
buf5c.fill(92);
for (let i = 0; i < hFinal.length && i < 64; i++) {
buf36[i] ^= hFinal[i];
buf5c[i] ^= hFinal[i];
}
const x3 = u8concat([ sha1U8(buf36), sha1U8(buf5c) ]);
return x3.slice(0, keyBytesLen);
}

function decryptStandardOfficeFile(bytes, password) {
const cfb = XLSX.CFB.read(bytes, {
type: "array"
});
const encInfo = getCfbStream(cfb, "EncryptionInfo");
const encPkg = getCfbStream(cfb, "EncryptedPackage");
if (!encInfo || !encPkg) throw new Error("암호화 스트림(EncryptionInfo/EncryptedPackage)을 찾을 수 없습니다.");
const dv = new DataView(encInfo.buffer, encInfo.byteOffset, encInfo.byteLength);
const headerSize = dv.getUint32(8, true);
const hdrOff = 12;
const algId = dv.getUint32(hdrOff + 8, true);
const algIdHash = dv.getUint32(hdrOff + 12, true);
let keyBits = dv.getUint32(hdrOff + 16, true);
if (algIdHash !== 0 && algIdHash !== 32772) {
throw new Error("지원하지 않는 해시 방식입니다. 엑셀에서 암호를 해제한 뒤 올려주세요.");
}
if (!(algId === 0 || algId === 26126 || algId === 26127 || algId === 26128)) {
throw new Error("RC4 등 지원하지 않는 암호화 방식입니다. 엑셀에서 암호를 해제한 뒤 올려주세요.");
}
if (!keyBits) keyBits = 128;
let off = hdrOff + headerSize;
const saltSize = dv.getUint32(off, true);
off += 4;
const salt = encInfo.slice(off, off + saltSize);
off += saltSize;
const encVerifier = encInfo.slice(off, off + 16);
off += 16;
off += 4;
const encVerifierHash = encInfo.slice(off, off + 32);
let h = sha1U8(salt, utf16leBytes(password));
for (let i = 0; i < 5e4; i++) h = sha1U8(u32le(i), h);
const key = standardDeriveKey(h, keyBits / 8);
const verifier = aesEcbDecryptRaw(key, encVerifier);
const verifierHash = aesEcbDecryptRaw(key, encVerifierHash);
const calc = sha1U8(verifier);
for (let i = 0; i < 20; i++) {
if (calc[i] !== verifierHash[i]) throw new Error("WRONG_PASSWORD");
}
const pkgDv = new DataView(encPkg.buffer, encPkg.byteOffset, encPkg.byteLength);
const size = pkgDv.getUint32(0, true);
const body = encPkg.slice(8);
const aligned = body.length % 16 ? body.slice(0, body.length - body.length % 16) : body;
return aesEcbDecryptRaw(key, aligned).slice(0, size);
}

function decryptOfficeFile(bytes, password) {
const cfb = XLSX.CFB.read(bytes, {
type: "array"
});
const encInfoRaw = getCfbStream(cfb, "EncryptionInfo");
if (!encInfoRaw) throw new Error("EncryptionInfo 스트림을 찾을 수 없습니다.");
const versionMajor = encInfoRaw[0] | encInfoRaw[1] << 8;
const versionMinor = encInfoRaw[2] | encInfoRaw[3] << 8;
if (versionMajor === 4 && versionMinor === 4) return decryptAgileOfficeFile(bytes, password);
if (versionMinor === 2 && (versionMajor === 2 || versionMajor === 3 || versionMajor === 4)) return decryptStandardOfficeFile(bytes, password);
throw new Error("지원하지 않는 암호화 방식입니다(버전 " + versionMajor + "." + versionMinor + '). 엑셀에서 "다른 이름으로 저장"으로 암호를 해제한 뒤 다시 올려주세요.');
}

function isEncryptedOfficeFile(bytes) {
try {
const cfb = XLSX.CFB.read(bytes, {
type: "array"
});
return !!getCfbStream(cfb, "EncryptionInfo");
} catch (e) {
return false;
}
}

function decryptAgileOfficeFile(bytes, password) {
const cfb = XLSX.CFB.read(bytes, {
type: "array"
});
const encInfoRaw = getCfbStream(cfb, "EncryptionInfo");
if (!encInfoRaw) throw new Error("EncryptionInfo 스트림을 찾을 수 없습니다.");
const versionMajor = encInfoRaw[0] | encInfoRaw[1] << 8;
const versionMinor = encInfoRaw[2] | encInfoRaw[3] << 8;
if (!(versionMajor === 4 && versionMinor === 4)) {
throw new Error("지원하지 않는 암호화 방식입니다(버전 " + versionMajor + "." + versionMinor + '). 엑셀에서 "다른 이름으로 저장"으로 암호를 해제한 뒤 다시 올려주세요.');
}
const xml = new TextDecoder("utf-8").decode(encInfoRaw.slice(8));
const info = parseEncryptionInfoXml(xml);
const kd = info.keyData, ek = info.encryptedKey;
const hashAlgo = ek.hashAlgorithm === "SHA512" ? "SHA-512" : "SHA-1";
const spinCount = parseInt(ek.spinCount, 10);
const salt = b64ToU8(ek.saltValue);
const pwBytes = utf16leBytes(password);
let h = agileHash(hashAlgo, salt, pwBytes);
for (let i = 0; i < spinCount; i++) h = agileHash(hashAlgo, u32le(i), h);
const keyBytes = parseInt(ek.keyBits, 10) / 8;
const kVerifierInput = fitKeyLen(agileHash(hashAlgo, h, AGILE_BLOCK_VERIFIER_INPUT), keyBytes);
const kVerifierValue = fitKeyLen(agileHash(hashAlgo, h, AGILE_BLOCK_VERIFIER_VALUE), keyBytes);
const kKeyValue = fitKeyLen(agileHash(hashAlgo, h, AGILE_BLOCK_KEY_VALUE), keyBytes);
const iv = fitKeyLen(salt, 16);
const verifierHashInput = aesCbcDecryptRaw(kVerifierInput, iv, b64ToU8(ek.encryptedVerifierHashInput));
const verifierHashValueDec = aesCbcDecryptRaw(kVerifierValue, iv, b64ToU8(ek.encryptedVerifierHashValue));
const computedVerifierHash = agileHash(hashAlgo, verifierHashInput);
const hashSize = parseInt(ek.hashSize, 10);
let match = true;
for (let i = 0; i < hashSize; i++) {
if (computedVerifierHash[i] !== verifierHashValueDec[i]) {
match = false;
break;
}
}
if (!match) throw new Error("WRONG_PASSWORD");
const secretKey = aesCbcDecryptRaw(kKeyValue, iv, b64ToU8(ek.encryptedKeyValue));
const kdHashAlgo = kd.hashAlgorithm === "SHA512" ? "SHA-512" : "SHA-1";
const kdSalt = b64ToU8(kd.saltValue);
const kdBlockSize = parseInt(kd.blockSize, 10);
const pkg = getCfbStream(cfb, "EncryptedPackage");
const dv = new DataView(pkg.buffer, pkg.byteOffset, pkg.byteLength);
const totalSize = dv.getUint32(4, true) * 4294967296 + dv.getUint32(0, true);
const encData = pkg.slice(8);
const SEGMENT = 4096;
const segs = [];
for (let off = 0; off < encData.length; off += SEGMENT) {
const segIdx = off / SEGMENT;
const segIv = fitKeyLen(agileHash(kdHashAlgo, kdSalt, u32le(segIdx)), kdBlockSize);
const segData = encData.slice(off, Math.min(off + SEGMENT, encData.length));
segs.push(aesCbcDecryptRaw(secretKey, segIv, segData));
}
return u8concat(segs).slice(0, totalSize);
}
OPS.isEncryptedOfficeFile = isEncryptedOfficeFile;
OPS.decryptOfficeFile = decryptOfficeFile;
})(typeof window !== "undefined" ? window : globalThis);
