// Paso 1: registrar la identidad de tu agente (ERC-8004) en BSC Testnet.
// Esto no hace nada "inteligente" todavía — solo prueba que la wallet, la red
// y el SDK están bien configurados, y te da un agent_id real en la cadena.

import { EVMWalletProvider, loadEnv } from "@bnbagent/sdk";
import { AgentEndpoint, ERC8004Agent } from "@bnbagent/sdk/erc8004";

loadEnv(); // carga .env.local y despues .env

async function main() {
	// La wallet: si no hay PRIVATE_KEY en el .env.local, el SDK genera una
	// wallet nueva y la guarda encriptada en disco usando WALLET_PASSWORD.
	const wallet = new EVMWalletProvider({
		password: process.env.WALLET_PASSWORD!,
		privateKey: process.env.PRIVATE_KEY,
	});

	// Conecta la wallet a una red concreta: lee el contrato de Identity Registry
	// correcto para esa red (distinto address en testnet vs mainnet) y deja el
	// cliente listo para leer/escribir en el registro ERC-8004 de esa cadena.
	// process.env.NETWORK viene de tu .env.local (bsc-mainnet); si no estuviera
	// seteado, cae al default "bsc-testnet" hardcodeado acá.
	const sdk = await ERC8004Agent.create({
		walletProvider: wallet,
		network: process.env.NETWORK ?? "bsc-testnet",
	});

	// generateAgentUri NO toca la red todavía — solo arma en memoria el JSON del
	// "Agent Card" (tu tarjeta de identidad pública) y lo devuelve envuelto en un
	// data URI (algo como "data:application/json;base64,...."). Por eso el
	// endpoint de abajo puede ser un placeholder: nada llama a esa URL, es solo
	// un campo más dentro de la tarjeta.
	const agentUri = sdk.generateAgentUri({
		name: "lean-agente-aprendizaje",
		description: "Agente de prueba de Lean para aprender BNBAgent SDK",
		endpoints: [
			new AgentEndpoint({
				name: "web",
				endpoint: "https://example.com/status", // placeholder, no importa todavia
			}),
		],
	});

	// Acá recién se firma y se manda la transacción real a la blockchain: el
	// contrato guarda ese agentUri y te asigna un agentId nuevo.
	console.log("Registrando agente en la cadena...");
	const result = await sdk.registerAgent(agentUri);

	console.log("\n✅ Listo. Tu agente ya existe on-chain:");
	console.log(`   agent_id: ${result.agentId}`);
	console.log(`   tx hash:  ${result.transactionHash}`);
	console.log(
		`\nBuscalo en 8004scan o en un explorer de BSC Testnet con ese tx hash.`,
	);
}

main().catch((err) => {
	console.error("\n❌ Algo falló:", err);
	process.exit(1);
});
