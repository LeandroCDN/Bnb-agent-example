# bnb-agent-example

Proyecto de aprendizaje: un agente on-chain en BNB Chain construido con
[`@bnbagent/sdk`](https://www.npmjs.com/package/@bnbagent/sdk) directo (sin
generadores de código a partir de lenguaje natural). El objetivo es entender
línea por línea el stack de "agentes on-chain" — identidad verificable y
pagos autónomos.

## Qué hay acá

- **[`register-agent.ts`](./register-agent.ts)** — registra la identidad del
  agente on-chain siguiendo el estándar **[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)**
  ("Trustless Agents"). Corriéndolo se obtiene un `agent_id` real y un `tx hash`
  verificable en un explorer de BSC.
- **[`x402-demo.ts`](./x402-demo.ts)** — demo end-to-end del protocolo
  **[x402](https://www.x402.org/)** (pagos HTTP-nativos vía el status code
  `402 Payment Required`): un `GET` recibe un `402` con las condiciones de
  pago, se firma una autorización [EIP-712](https://eips.ethereum.org/EIPS/eip-712)
  ([EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) `TransferWithAuthorization`)
  con la wallet del agente, y se reintenta la request con el pago adjunto en
  el header `X-PAYMENT`. Corre contra un servidor local mock (jugando el rol
  de "vendedor") para ver el mecanismo sin depender de un endpoint real.

## Librerías y estándares usados

| Librería / estándar | Para qué |
|---|---|
| [`@bnbagent/sdk`](https://github.com/bnb-chain/bnbagent-sdk) ([docs](https://docs.bnbchain.org/developer-kit/bnbagent-sdk/quickstart-typescript/)) | SDK oficial de BNB Chain: wallets, identidad ERC-8004, pagos x402, comercio entre agentes (ERC-8183) |
| [`viem`](https://viem.sh/) | Librería de bajo nivel para Ethereum/EVM que usa el SDK por debajo (firmas, tipado de direcciones, EIP-712) |
| [`tsx`](https://github.com/privatenumber/tsx) | Ejecuta los `.ts` directo, sin paso de compilación manual |
| [`TypeScript`](https://www.typescriptlang.org/) | Tipado estático |
| [`pnpm`](https://pnpm.io/) | Gestor de paquetes |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Estándar de identidad/reputación/validación para agentes autónomos |
| [x402](https://www.x402.org/) | Estándar abierto de pagos HTTP-nativos (creado por Coinbase), usado acá sobre BNB Chain |

## Setup

Requiere Node.js >= 20.

```bash
pnpm install
```

Creá un `.env.local` (nunca se commitea, está en `.gitignore`) con:

```
NETWORK=bsc-mainnet
WALLET_PASSWORD=<una contraseña propia>
PRIVATE_KEY=<private key de una wallet DEDICADA a este proyecto, con saldo mínimo>
```

⚠️ Es mainnet real: la wallet gasta BNB de gas real al registrar el agente.
Usar una wallet nueva, exclusiva para esto, con montos chicos.

## Scripts

```bash
pnpm run register        # registra la identidad del agente (ERC-8004) on-chain
pnpm exec tsx x402-demo.ts   # corre la demo del flujo de pago x402
```

## Estado actual

Agente registrado en BSC mainnet: `agent_id 326816`
([tx](https://bscscan.com/tx/0xa2831ab788e4d5ffaaf6dc2ee814436be062c3b18f9a1e7371248f1116c27556)).

