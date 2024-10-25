
// Utility to extract function names and parameters
function getFunctionSignature(func) {
	const fnStr = func.toString();
	const result = fnStr.match(/function\s*\w*\s*\(([^)]*)\)/) || fnStr.match(/\(([^)]*)\)\s*=>/);
	const params = result ? result[1].replace(/\s+/g, '') : '';
	return `${func.name}[${params}]`
}


function historyManager(instructions, mode) {
	let messages = [];

	if (mode === "scratchpad") {
		messages = [{ role: "system", content: instructions }];
		messages.push({ role: "user", content: "" });  // The last message will hold the entire scratchpad
	} else if (mode === "messages") {
		messages = [{ role: "system", content: instructions }];
	}

	function append(content, role = "assistant") {
		if (mode === "scratchpad") {
			// Append to the content of the last message (the "scratchpad")
			const lastMessageIndex = messages.length - 1;
			messages[lastMessageIndex].content += `${content}\n`;
		} else if (mode === "messages") {
			// Append as a new message element
			messages.push({ role, content });
		}
	}

	function history() {
		return messages;
	}
	return { append, history };
}

function parseAction(reasoning) {
	const actionMatch = reasoning.match(/Action:\s*(\w+)\[([^\]]*)\]/);

	if (actionMatch) {
		const action = actionMatch[1].trim();
		const actionInput = actionMatch[2].trim() || null;
		return { action, actionInput };
	}

	return null; // Return null if no action is found
}

async function executeTool(tools, action, actionInput) {
	if (tools[action]) {
		return await tools[action](actionInput);
	} else {
		throw new Error(`Invalid action: ${action}`);
	}
}

// Main loop to handle reasoning, action execution, and history updates
async function runAgentLoop(callLLM, tools, historyHandler, roundLimit) {
	let round = 0;

	while (true) {
		if (++round > roundLimit) {
			console.log('roundLimit exceeded: ' + (round - 1));
			break;
		}

		console.log(`Round ${round}:`);

		// Step 1: Call GPT-4 to reason
		let reasoning = await callLLM(historyHandler.history());
		console.log("Raw Reasoning:", reasoning);

		// Trim response after 'Observation:'
		const observationIndex = reasoning.indexOf('Observation:');
		if (observationIndex !== -1) {
			reasoning = reasoning.substring(0, observationIndex).trim();
		}

		// Step 2: Append the reasoning to the history
		historyHandler.append(reasoning);

		// Step 3: Parse the action and execute the tool
		const actionData = parseAction(reasoning);
		if (!actionData) {
			console.log("No valid action found.");
			break;
		}

		const { action, actionInput } = actionData;

		try {
			const observation = await executeTool(tools, action, actionInput);
			console.log("Observation Result:", observation);

			// Step 4: Append the observation to the history
			historyHandler.append(`Observation: ${observation}`, "system");

			// Check if final answer is reached
			if (reasoning.includes("Final Answer")) {
				console.log("Final Answer:", reasoning);
				break;
			}
		} catch (error) {
			console.error(error.message);
			break;
		}

		console.log("Current Messages:", historyHandler.history());
	}

	return historyHandler.history();
}

function ReActAgent(userConfig) {
	if (!userConfig.callLLM) {
		throw new Error('please provide callLLM function');
	}

	let config = {
		mode: 'scratchpad', // 'scratchpad' or 'messages'
		roundLimit: 6,
		tools: []
	};
	Object.assign(config, userConfig);

	const toolSignatures = Object.entries(config.tools).map(([name, func]) => getFunctionSignature(func)).join(", ");
	const FORMAT_INSTRUCTIONS = `Use the following format:

		Question: the input question you must answer
		Thought: you should always think about what to do
		Action: the action to take, should be one of [${toolSignatures}].
		Observation: the result of the action
		... (this Thought/Action/Observation can repeat N times)
		Thought: I now know the final answer
		Final Answer: the final answer to the original input question`;

	function run(question) {
		const historyHandler = historyManager(FORMAT_INSTRUCTIONS, config.mode);
		historyHandler.append(`Question: ${question}`, "user");

		return runAgentLoop(config.callLLM, config.tools, historyHandler, config.roundLimit);
	}

	return { run };
}

module.exports = { ReActAgent };
