
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

function ReActAgent(question, userConfig) {
	if (!userConfig.callLLM) {
	  throw new Error('please provide callLLM function');
	}
  
	// Configuration setup
	const config = {
	  mode: 'scratchpad', // 'scratchpad' or 'messages'
	  ...userConfig,
	};
	const toolSignatures = Object.entries(config.tools).map(([name, func]) => getFunctionSignature(func)).join(", ");
	// Formatting instructions
	const FORMAT_INSTRUCTIONS = `Use the following format:
	  Question: the input question you must answer
	  Thought: you should always think about what to do
	  Action: the action to take, should be one of [${toolSignatures}].
	  Observation: the result of the action
	  ... (this Thought/Action/Observation can repeat N times)
	  Thought: I now know the final answer
	  Final Answer: the final answer to the original input question`;
  
	// Initialize the history manager with the question
	const historyHandler = historyManager(FORMAT_INSTRUCTIONS, config.mode);
	historyHandler.append(`Question: ${question}`, "user");
  
	let isWaitingForObservation = false;
	let currentAction = null;
	let currentActionInput = null;
  
	// Step function to advance the reasoning and parse the next action
	async function step() {
	  if (isWaitingForObservation) {
		throw new Error('Agent is waiting for an observation. Call observe() first.');
	  }
  
	  // Call LLM to advance reasoning
	  const reasoning = await config.callLLM(historyHandler.history());
	  console.log("Raw Reasoning:", reasoning);
  
	  // Trim the response after 'Observation:' if present
	  const observationIndex = reasoning.indexOf('Observation:');
	  const trimmedReasoning = observationIndex !== -1 ? reasoning.substring(0, observationIndex).trim() : reasoning;
  
	  // Append reasoning to history
	  historyHandler.append(trimmedReasoning);
  
	  // Check if final answer has been reached
	  if (trimmedReasoning.includes("Final Answer")) {
		return { done: true, messages: historyHandler.history(), answer: trimmedReasoning };
	  }
  
	  // Parse the action
	  const actionData = parseAction(trimmedReasoning);
	  if (!actionData) {
		return { done: true, messages: historyHandler.history() }; // Stop if no valid action is found
	  }
  
	  // Store action details and set to waiting state
	  isWaitingForObservation = true;
	  currentAction = actionData.action;
	  currentActionInput = actionData.actionInput;
  
	  // Return action to execute externally
	  return { done: false, action: currentAction, actionInput: currentActionInput };
	}
  
	// Observe function to handle the observation and reset waiting state
	function observe(observation) {
	  if (!isWaitingForObservation) {
		throw new Error('Agent is not waiting for an observation.');
	  }
  
	  console.log("Observation Result:", observation);
  
	  // Append the observation to the history and reset state
	  historyHandler.append(`Observation: ${observation}`, "system");
	  isWaitingForObservation = false;
	}
  
	return { step, observe };
  }
  
module.exports = { ReActAgent };
