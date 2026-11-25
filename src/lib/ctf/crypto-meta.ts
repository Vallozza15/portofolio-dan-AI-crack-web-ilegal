export const CRYPTO_OPERATION_GROUPS: Array<{
  group: string;
  operations: Array<{ id: string; label: string }>;
}> = [
  {
    group: "Encoding",
    operations: [
      { id: "base64_encode", label: "Base64 encode" },
      { id: "base64_decode", label: "Base64 decode" },
      { id: "base64url_encode", label: "Base64url encode" },
      { id: "base64url_decode", label: "Base64url decode" },
      { id: "base32_encode", label: "Base32 encode" },
      { id: "base32_decode", label: "Base32 decode" },
      { id: "base58_encode", label: "Base58 encode" },
      { id: "base58_decode", label: "Base58 decode" },
      { id: "hex_encode", label: "Hex encode" },
      { id: "hex_decode", label: "Hex decode" },
      { id: "binary_encode", label: "Binary encode" },
      { id: "binary_decode", label: "Binary decode" },
      { id: "decimal_encode", label: "Decimal encode" },
      { id: "decimal_decode", label: "Decimal decode" },
      { id: "url_encode", label: "URL encode" },
      { id: "url_decode", label: "URL decode" },
      { id: "html_encode", label: "HTML encode" },
      { id: "html_decode", label: "HTML decode" },
      { id: "unicode_escape", label: "Unicode escape" },
      { id: "unicode_unescape", label: "Unicode unescape" },
      { id: "auto_decode", label: "Auto-decode bertingkat" },
    ],
  },
  {
    group: "Klasik",
    operations: [
      { id: "rot13", label: "ROT13" },
      { id: "rot47", label: "ROT47" },
      { id: "atbash", label: "Atbash" },
      { id: "caesar_shift", label: "Caesar shift" },
      { id: "caesar_bruteforce", label: "Caesar brute force" },
      { id: "vigenere_encode", label: "Vigenère encode" },
      { id: "vigenere_decode", label: "Vigenère decode" },
      { id: "railfence_encode", label: "Rail fence encode" },
      { id: "railfence_decode", label: "Rail fence decode" },
      { id: "morse_encode", label: "Morse encode" },
      { id: "morse_decode", label: "Morse decode" },
    ],
  },
  {
    group: "Analisis",
    operations: [
      { id: "frequency", label: "Frequency analysis" },
      { id: "entropy", label: "Shannon entropy" },
      { id: "hash", label: "Hash" },
      { id: "hash_identify", label: "Hash identifier" },
    ],
  },
  {
    group: "Modern (edukasi)",
    operations: [
      { id: "xor_single_bruteforce", label: "XOR single-byte brute force" },
      { id: "xor_repeating", label: "XOR repeating key" },
      { id: "aes", label: "AES encrypt/decrypt" },
      { id: "rsa", label: "RSA math" },
    ],
  },
];

export const CRYPTO_OPERATION_LABELS: Record<string, string> = Object.fromEntries(
  CRYPTO_OPERATION_GROUPS.flatMap((group) =>
    group.operations.map((operation) => [operation.id, operation.label]),
  ),
);

export type ParamKind = "text" | "number" | "select" | "textarea";

export interface ParamField {
  key: string;
  label: string;
  kind: ParamKind;
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  hint?: string;
}

export const CRYPTO_PARAM_FIELDS: Record<string, ParamField[]> = {
  auto_decode: [{ key: "depth", label: "Kedalaman maksimum", kind: "number", defaultValue: "5" }],
  caesar_shift: [{ key: "shift", label: "Shift", kind: "number", defaultValue: "3" }],
  vigenere_encode: [{ key: "key", label: "Key", kind: "text", defaultValue: "KEY" }],
  vigenere_decode: [{ key: "key", label: "Key", kind: "text", defaultValue: "KEY" }],
  railfence_encode: [{ key: "rails", label: "Rails", kind: "number", defaultValue: "3" }],
  railfence_decode: [{ key: "rails", label: "Rails", kind: "number", defaultValue: "3" }],
  xor_single_bruteforce: [
    { key: "inputEncoding", label: "Input encoding", kind: "select", options: ["hex", "text", "base64"], defaultValue: "hex" },
  ],
  xor_repeating: [
    { key: "key", label: "Key", kind: "text", defaultValue: "secret" },
    { key: "inputEncoding", label: "Input encoding", kind: "select", options: ["text", "hex", "base64"], defaultValue: "text" },
  ],
  hash: [
    { key: "algorithm", label: "Algorithm", kind: "select", options: ["md5", "sha1", "sha256", "sha512"], defaultValue: "sha256" },
    { key: "encoding", label: "Input encoding", kind: "select", options: ["utf8", "hex", "base64"], defaultValue: "utf8" },
  ],
  aes: [
    { key: "action", label: "Action", kind: "select", options: ["decrypt", "encrypt"], defaultValue: "decrypt" },
    { key: "algorithm", label: "Algorithm", kind: "select", options: ["aes-256-cbc", "aes-256-gcm", "aes-128-cbc", "aes-192-cbc", "aes-256-ecb"], defaultValue: "aes-256-cbc" },
    { key: "key", label: "Key", kind: "text", placeholder: "32 byte / hex / base64" },
    { key: "keyEncoding", label: "Key encoding", kind: "select", options: ["utf8", "hex", "base64"], defaultValue: "utf8" },
    { key: "iv", label: "IV", kind: "text", placeholder: "16 byte untuk CBC" },
    { key: "ivEncoding", label: "IV encoding", kind: "select", options: ["utf8", "hex", "base64"], defaultValue: "utf8" },
    { key: "inputEncoding", label: "Input encoding", kind: "select", options: ["base64", "hex", "utf8"], defaultValue: "base64" },
    { key: "tag", label: "GCM auth tag", kind: "text", placeholder: "hex 16 byte (decrypt GCM)" },
    { key: "tagEncoding", label: "Tag encoding", kind: "select", options: ["hex", "base64"], defaultValue: "hex" },
  ],
  rsa: [
    { key: "action", label: "Action", kind: "select", options: ["decrypt", "inspect"], defaultValue: "decrypt" },
    { key: "n", label: "n (modulus)", kind: "textarea", placeholder: "Desimal atau 0x…" },
    { key: "e", label: "e (exponent)", kind: "text", defaultValue: "65537" },
    { key: "c", label: "c (ciphertext)", kind: "textarea" },
    { key: "p", label: "p (opsional)", kind: "text" },
    { key: "q", label: "q (opsional)", kind: "text" },
    { key: "publicKey", label: "Public key PEM (inspect)", kind: "textarea", placeholder: "-----BEGIN PUBLIC KEY-----" },
  ],
};
