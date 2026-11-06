/**
 * Jelentett üzenet visszafejtése A BÖNGÉSZŐBEN a moderátor privát kulcsával. A privát kulcs sosem megy a szerverre,
 * és a függvény nem tárolja. Visszaadja a szöveget (vagy média-metaadatot) és az aláírás ellenőrzésének eredményét.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { decryptMessageBody, fromB64, messageSignatureInput, openSealed, type WrappedKeyEntry } from "@/protocol/wrap";

export interface ReportedContent {
  message: {
    type: string;
    ciphertext: string;
    nonce: string;
    signature: string | null;
    conversationId: string;
    clientMessageId: string;
    wrappedKeysHashInput: WrappedKeyEntry[];
  };
  senderSigningPublicKey: string | null;
  grant: { wrappedKey: string; ephemeralPublicKey: string; wrapNonce: string; expiresAt: string };
}

export interface DecryptResult {
  text: string;
  signatureValid: boolean | null;
}

export function decryptReported(content: ReportedContent, moderationPrivateKeyB64: string): DecryptResult {
  const priv = fromB64(moderationPrivateKeyB64.trim());
  if (priv.length !== 32) throw new Error("A kulcs 32 bájtos X25519 privát kulcs kell legyen (base64).");
  const contentKey = openSealed(priv, content.grant);
  const body = decryptMessageBody(contentKey, content.message.nonce, content.message.ciphertext);
  let signatureValid: boolean | null = null;
  if (content.message.signature && content.senderSigningPublicKey) {
    try {
      signatureValid = ed25519.verify(
        fromB64(content.message.signature),
        messageSignatureInput({ ...content.message, wrappedKeys: content.message.wrappedKeysHashInput }),
        fromB64(content.senderSigningPublicKey),
      );
    } catch {
      signatureValid = false;
    }
  }
  // Szöveges üzenet: a payload JSON `{ text }`; egyéb esetben a nyers JSON metaadatot mutatjuk.
  const decoded = new TextDecoder().decode(body);
  let text = decoded;
  try {
    const j = JSON.parse(decoded) as { text?: string };
    if (typeof j.text === "string") text = j.text;
  } catch {
    /* nem JSON – nyers szöveg */
  }
  return { text, signatureValid };
}
