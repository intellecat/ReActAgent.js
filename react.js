
// Utility to extract function parameter names dynamically
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
  
  async function reasonAndAct(callLLM, instructions, userInput, mode = "scratchpad", roundLimit = 6, tools) {
    let round = 0;
  
    const historyHandler = historyManager(instructions, mode);
  
    historyHandler.append(`Question: ${userInput}`, "user");
  
    while (true) {
      if (++round>roundLimit) {
        console.log( 'roundLimit exceeded: '+(round-1) )
        break
      }
      console.log(`Round ${round}:`);
  
      let reasoning = await callLLM(historyHandler.history());
      console.log("raw Reasoning:", reasoning);

      const observationIndex = reasoning.indexOf('Observation:');
      if (observationIndex !== -1) {
        reasoning = reasoning.substring(0, observationIndex).trim();
      }
    //   console.log("Trimmed Reasoning:", reasoning);
  
      historyHandler.append(reasoning);
  
      const actionMatch = reasoning.match(/Action:\s*(\w+)\[([^\]]*)\]/)
  
      if (actionMatch) {
        const action = actionMatch[1].trim();
        const actionInput = actionMatch[2].trim() || null
//      console.log('[action]', action, actionInput)
        if (tools[action]) {
          const observation = await tools[action](actionInput);
          console.log("Observation Result:", observation);
  
          historyHandler.append(`Observation: ${observation}`, "system");
        } else {
          console.error("Invalid action detected!");
          break;
        }
      }
  
      if (reasoning.includes("Final Answer")) {
        console.log("Final Answer:", reasoning);
        break;
      }
  
      console.log("Current Messages:", historyHandler.history());
    }
  
    const allMessages =  historyHandler.history()
    // console.log("Final Messages Output:\n", allMessages[allMessages.length-1].content);
    return allMessages[allMessages.length-1].content
  }

function ReActAgent(userConfig) {
    if (!userConfig.callLLM) {
      throw new Error('please provide callLLM function')
    }  

    let config = {
        mode: 'scratchpad', //scratchpad, messages
        roundLimit: 6,
        tools: []
    }
    Object.assign(config, userConfig)
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
        return reasonAndAct(config.callLLM, FORMAT_INSTRUCTIONS, question, config.mode, config.roundLimit, config.tools)
    }

    return {run}
}

  module.exports = { ReActAgent };