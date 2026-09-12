// Demo de x402: GET -> 402 -> firma EIP-712 -> reintento con el pago adjunto.
// Todo corre en un solo proceso: nosotros mismos jugamos de "vendedor" (server
// local) y de "comprador" (tu wallet real), para ver el protocolo completo
// sin depender de un endpoint x402 real en internet.

import { EVMWalletProvider, loadEnv } from "@bnbagent/sdk"; // wallet + carga de .env.local
import { randomBytes } from "crypto"; // para generar el "nonce" random del pago
import { createServer } from "http"; // para levantar el server mock que hace de vendedor
import { X402Signer } from "@bnbagent/sdk/x402"; // el firmante con las guardas de seguridad de x402
import {
  BSC_MAINNET_CHAIN_ID, // = 56, el id numérico de BSC mainnet
  PAYMENT_TOKEN_EIP712_NAME, // = "United Stables", nombre del dominio EIP-712 del token U
  PAYMENT_TOKEN_EIP712_VERSION, // = "1", versión de ese mismo dominio
  getAddress, // devuelve las direcciones de contratos desplegados para un chainId dado
} from "@bnbagent/sdk/networks";

// ---- Datos fijos que usa el "vendedor" mock (server local) ----
const U_TOKEN = getAddress(BSC_MAINNET_CHAIN_ID).paymentToken; // dirección real del contrato del token U en mainnet
const PAY_TO = "0xa742526887588C66374Db057eD76FF05a45A887B"; // a quién le "pagamos" (checksummeada, para que viem no la rechace)
const PRICE = 100_000n; // 0.1 U (el token tiene 6 decimales) -> la "n" al final = BigInt de JS

// El "vendedor": esta función corre una vez por cada request HTTP que llega al server mock.
// Decide si cobra o entrega el dato, según si vino el header "x-payment".
function requestHandler(req: any, res: any) {
  if (!req.headers["x-payment"]) {
    // No hay pago adjunto -> respondo 402 (Payment Required) explicando qué y cuánto tiene que pagar.
    // Este JSON es el "challenge" o "quote": la lista accepts[] son las formas de pago que acepto.
    const body = JSON.stringify({
      x402Version: 2, // versión del protocolo x402 que hablamos
      accepts: [
        {
          scheme: "exact", // "exact" = pagás exactamente este monto, ni más ni menos (hay otros esquemas en el estándar)
          network: `eip155:${BSC_MAINNET_CHAIN_ID}`, // "eip155:56" = BSC mainnet, en formato CAIP-2 (estándar multi-chain)
          asset: U_TOKEN, // en qué token se paga
          payTo: PAY_TO, // a qué dirección
          amount: PRICE.toString(), // JSON no soporta BigInt nativamente, por eso .toString()
          maxTimeoutSeconds: 300, // ventana de validez que le doy al comprador para pagar: 5 minutos
          extra: { name: PAYMENT_TOKEN_EIP712_NAME, version: PAYMENT_TOKEN_EIP712_VERSION }, // datos para el dominio EIP-712
        },
      ],
    });
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(body);
    return; // corto acá, no sigo a la rama de abajo
  }

  // Hay pago adjunto -> se lo doy. Este mock NO valida la firma (un vendedor real
  // se la pasaría a un "facilitator" que sí la verifica antes de liquidar el pago).
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ dato: "BNB a USD 850.32 (inventado, es un demo)" }));
}

async function main() {
  loadEnv(); // lee .env.local (y después .env) y llena process.env

  // Levanto el "vendedor" en un puerto libre del sistema operativo (el 0 = "dame el que esté libre").
  const server = createServer(requestHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); // espero a que esté escuchando de verdad
  const port = (server.address() as any).port; // el SO ya asignó un puerto concreto, lo leo
  const url = `http://127.0.0.1:${port}/precio`; // la URL completa a la que le vamos a pegar

  // El "comprador": reconstruyo la MISMA wallet que registró el agente 326816
  // (misma PRIVATE_KEY del .env.local) — una sola llave para identidad y para pagar.
  const wallet = new EVMWalletProvider({
    password: process.env.WALLET_PASSWORD!,
    privateKey: process.env.PRIVATE_KEY,
  });
  // X402Signer envuelve la wallet con guardas: nunca firma más de PRICE para el token U,
  // sin importar lo que diga el challenge que reciba.
  const signer = new X402Signer(wallet, { maxValuePerCall: { [U_TOKEN]: PRICE } });
  console.log(`Comprador: ${wallet.address}`);

  // ---- Paso 1: pido el recurso SIN pagar ----
  let res = await fetch(url); // GET normal, sin headers especiales
  console.log(`\n1) GET -> ${res.status}`); // acá va a imprimir 402
  const challenge = await res.json(); // parseo el body del 402 (el JSON que armamos arriba)
  const accept = challenge.accepts[0]; // tomo la primera (y única) opción de pago que ofrece

  // ---- Paso 2: armo el mensaje EIP-712 que autoriza la transferencia, y lo firmo ----
  const now = Math.floor(Date.now() / 1000); // timestamp actual en segundos (igual que usa Solidity/EVM)
  const message = {
    from: wallet.address, // quién paga: yo
    to: accept.payTo, // a quién: lo que dijo el challenge
    value: BigInt(accept.amount), // cuánto, como BigInt (para operar con precisión de enteros de 256 bits)
    validAfter: now - 60, // válido desde hace 1 minuto (margen por si los relojes no están 100% sincronizados)
    validBefore: now + accept.maxTimeoutSeconds, // vence en 5 minutos (lo que pidió el challenge)
    nonce: `0x${randomBytes(32).toString("hex")}`, // 32 bytes random en hex -> evita que esta firma se pueda reusar
  };
  const signed = await signer.signPayment({
    // El "domain" ancla la firma a un contrato y una red específicos (estándar EIP-712).
    // Si alguien intentara reusarla en otra red o contra otro contrato, no calza y se rechaza.
    domain: {
      name: accept.extra.name,
      version: accept.extra.version,
      chainId: BSC_MAINNET_CHAIN_ID,
      verifyingContract: accept.asset, // el contrato del token U
    },
    // "types" describe la forma de los datos que se firman (como un schema).
    // TransferWithAuthorization es el nombre estándar de este mensaje en EIP-3009.
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    message, // los valores concretos que arriba armamos
    // expectedTo: MI copia de a quién le pago, fijada por mí, no la que vino en la respuesta del
    // server. Si el 402 viniera manipulado con otro payTo, X402Signer corta acá y no firma.
    expectedTo: PAY_TO,
  });
  console.log(`2) Firmado (sin gastar gas, es off-chain): ${signed.signature.slice(0, 12)}...`);

  // ---- Paso 3: reintento el mismo GET, ahora con la firma adjunta en el header X-PAYMENT ----
  // Armo el "sobre" de pago: los datos de la autorización + la firma, todo en un objeto...
  const envelope = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: accept.scheme,
      network: accept.network,
      payload: {
        authorization: {
          from: message.from,
          to: message.to,
          value: message.value.toString(), // de nuevo: JSON no banca BigInt, lo paso a string
          validAfter: message.validAfter.toString(),
          validBefore: message.validBefore.toString(),
          nonce: message.nonce,
        },
        signature: signed.signature,
      },
    }),
  ).toString("base64"); // ...y lo codifico en base64 para que viaje sin problemas dentro de un header HTTP

  res = await fetch(url, { headers: { "X-PAYMENT": envelope } }); // mismo GET, ahora con el pago adjunto
  const data = await res.json(); // esta vez debería ser el dato real, no un challenge
  console.log(`3) GET + X-PAYMENT -> ${res.status}`, data);

  server.close(); // apago el server mock, ya no lo necesito
}

main().catch((err) => {
  console.error("Algo falló:", err);
  process.exit(1);
});
