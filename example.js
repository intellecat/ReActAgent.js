const { OpenAI } = require("openai");
const { ReActAgent } = require('./react')

const OPENROUTER_API_KEY = 'sk-...'

const configuration = {
	apiKey: OPENROUTER_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1'
};
const client = new OpenAI(configuration);
async function callLLM(messages) {
	const response = await client.chat.completions.create({
		model: "meta-llama/llama-3.2-3b-instruct:free",
		messages: messages,
	});
	return response.choices[0].message.content.trim()
}

const tools = {
	"get_weather": async (city) => {
		return `Weather Forecast for  ${city}: 15°C and sunny.`;
	},
	"get_current_city": async () => {
		return `You are in Auckland`;
	},
	"calculator": (expression) => {
		try {
			return eval(expression); // Avoid eval in production apps
		} catch (err) {
			console.error(err)
			return "Invalid expression. Only allow numbers and operations(+ - * /)";
		}
	},
};

; (async () => {
	const question = "What's the temprature for my location tomorrow?"
	const agent = ReActAgent(question, { tools, mode: 'scratchpad', callLLM })

	while (true) {
		const result = await agent.step();
		if (result.done) {
			console.log(result.answer); // Final messages with reasoning history
			break;
		}
		if (result.action && tools[result.action]) {
			const observation = await tools[result.action](result.actionInput);
			agent.observe(observation);
		}
	}
})()
