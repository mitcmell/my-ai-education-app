const express = require('express');
const cors = require('cors');
const path = require('path');
const { BedrockRuntimeClient, InvokeModelCommand, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Model configurations with actual Bedrock model IDs
const AVAILABLE_MODELS = {
  // Anthropic Claude Models
  'claude-3-5-sonnet': {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet',
    category: 'Balanced Performance',
    description: 'Latest Claude model with enhanced capabilities',
    provider: 'Anthropic',
    contextWindow: 200000,
    pricing: 'medium'
  },
  'claude-3-sonnet': {
    id: 'anthropic.claude-3-sonnet-20240229-v1:0',
    name: 'Claude 3 Sonnet',
    category: 'Balanced Performance',
    description: 'Balanced performance and speed',
    provider: 'Anthropic',
    contextWindow: 200000,
    pricing: 'medium'
  },
  'claude-3-haiku': {
    id: 'anthropic.claude-3-haiku-20240307-v1:0',
    name: 'Claude 3 Haiku',
    category: 'Speed & Efficiency',
    description: 'Fast responses, cost-effective',
    provider: 'Anthropic',
    contextWindow: 200000,
    pricing: 'low'
  },
  'claude-3-opus': {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    name: 'Claude 3 Opus',
    category: 'Maximum Capability',
    description: 'Most capable model for complex tasks',
    provider: 'Anthropic',
    contextWindow: 200000,
    pricing: 'high'
  },

  // Amazon Titan Models
  'titan-text-express': {
    id: 'amazon.titan-text-express-v1',
    name: 'Titan Text Express',
    category: 'AWS Native',
    description: 'Fast, cost-effective text generation',
    provider: 'Amazon',
    contextWindow: 8000,
    pricing: 'low'
  },
  'titan-text-lite': {
    id: 'amazon.titan-text-lite-v1',
    name: 'Titan Text Lite',
    category: 'AWS Native',
    description: 'Lightweight text generation',
    provider: 'Amazon',
    contextWindow: 4000,
    pricing: 'very-low'
  },

  // Meta Llama Models
  'llama-3-70b': {
    id: 'meta.llama3-70b-instruct-v1:0',
    name: 'Llama 3 70B',
    category: 'Open Source',
    description: 'Large, capable open-source model',
    provider: 'Meta',
    contextWindow: 8000,
    pricing: 'medium'
  },
  'llama-3-8b': {
    id: 'meta.llama3-8b-instruct-v1:0',
    name: 'Llama 3 8B',
    category: 'Open Source',
    description: 'Smaller, efficient open-source model',
    provider: 'Meta',
    contextWindow: 8000,
    pricing: 'low'
  },

  // Mistral Models
  'mistral-7b': {
    id: 'mistral.mistral-7b-instruct-v0:2',
    name: 'Mistral 7B',
    category: 'Open Source',
    description: 'Efficient European open-source model',
    provider: 'Mistral AI',
    contextWindow: 32000,
    pricing: 'low'
  },
  'mistral-large': {
    id: 'mistral.mistral-large-2402-v1:0',
    name: 'Mistral Large',
    category: 'Maximum Capability',
    description: 'Large, capable model for complex tasks',
    provider: 'Mistral AI',
    contextWindow: 32000,
    pricing: 'high'
  },

  // Cohere Models
  'command-r': {
    id: 'cohere.command-r-v1:0',
    name: 'Command R',
    category: 'Specialized',
    description: 'Optimized for business applications',
    provider: 'Cohere',
    contextWindow: 128000,
    pricing: 'medium'
  },
  'command-r-plus': {
    id: 'cohere.command-r-plus-v1:0',
    name: 'Command R+',
    category: 'Maximum Capability',
    description: 'Enhanced version with better performance',
    provider: 'Cohere',
    contextWindow: 128000,
    pricing: 'high'
  }
};

// Default fallback model
const DEFAULT_MODEL = 'claude-3-sonnet';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running!', 
    timestamp: new Date().toISOString(),
    creator: 'Mitch Mello',
    purpose: 'AI Education Assistant for University Students',
    availableModels: Object.keys(AVAILABLE_MODELS).length
  });
});

// Get available models endpoint
app.get('/api/models', (req, res) => {
  try {
    const modelsByCategory = {};
    
    Object.entries(AVAILABLE_MODELS).forEach(([key, model]) => {
      if (!modelsByCategory[model.category]) {
        modelsByCategory[model.category] = [];
      }
      modelsByCategory[model.category].push({
        key,
        name: model.name,
        description: model.description,
        provider: model.provider,
        pricing: model.pricing,
        contextWindow: model.contextWindow
      });
    });

    res.json({
      categories: modelsByCategory,
      defaultModel: DEFAULT_MODEL,
      totalModels: Object.keys(AVAILABLE_MODELS).length
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// Function to format message for different model types
function formatMessageForModel(message, modelKey, systemPrompt) {
  const model = AVAILABLE_MODELS[modelKey];
  
  if (model.provider === 'Anthropic') {
    // Claude models use the messages format
    return {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: message }]
    };
  } else if (model.provider === 'Amazon') {
    // Titan models use a different format
    return {
      inputText: `${systemPrompt}\n\nHuman: ${message}\n\nAssistant:`,
      textGenerationConfig: {
        maxTokenCount: 4000,
        temperature: 0.7,
        topP: 0.9
      }
    };
  } else if (model.provider === 'Meta') {
    // Llama models format
    return {
      prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
      max_gen_len: 4000,
      temperature: 0.7,
      top_p: 0.9
    };
  } else if (model.provider === 'Mistral AI') {
    // Mistral models format
    return {
      prompt: `<s>[INST] ${systemPrompt}\n\n${message} [/INST]`,
      max_tokens: 4000,
      temperature: 0.7,
      top_p: 0.9
    };
  } else if (model.provider === 'Cohere') {
    // Cohere Command models format
    return {
      message: message,
      preamble: systemPrompt,
      max_tokens: 4000,
      temperature: 0.7,
      p: 0.9,
      chat_history: []
    };
  }
  
  // Fallback to Claude format
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4000,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: "user", content: message }]
  };
}

// Function to extract response from different model types
function extractResponseFromModel(responseBody, modelKey) {
  const model = AVAILABLE_MODELS[modelKey];
  
  try {
    const parsed = JSON.parse(responseBody);
    
    if (model.provider === 'Anthropic') {
      return parsed.content?.[0]?.text || parsed.completion || 'No response generated';
    } else if (model.provider === 'Amazon') {
      return parsed.results?.[0]?.outputText || 'No response generated';
    } else if (model.provider === 'Meta') {
      return parsed.generation || 'No response generated';
    } else if (model.provider === 'Mistral AI') {
      return parsed.outputs?.[0]?.text || 'No response generated';
    } else if (model.provider === 'Cohere') {
      return parsed.text || 'No response generated';
    }
    
    // Fallback
    return parsed.content?.[0]?.text || parsed.completion || JSON.stringify(parsed);
  } catch (error) {
    console.error('Error parsing response:', error);
    return 'Error parsing model response';
  }
}

// Main chat endpoint with enhanced model selection
app.post('/api/chat', async (req, res) => {
  try {
    console.log('=== NEW CHAT REQUEST ===');
    console.log('Request body:', req.body);
    
    const { 
      message, 
      model = DEFAULT_MODEL,
      mode = 'standard', 
      subject = 'general', 
      responseLength = 'balanced',
      webSearchEnabled = false,
      citationEnabled = false
    } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate model selection
    if (!AVAILABLE_MODELS[model]) {
      console.warn(`Unknown model requested: ${model}, falling back to ${DEFAULT_MODEL}`);
      return res.status(400).json({ 
        error: `Model "${model}" is not available. Please select from available models.`,
        availableModels: Object.keys(AVAILABLE_MODELS)
      });
    }

    const selectedModel = AVAILABLE_MODELS[model];
    console.log(`Using model: ${selectedModel.name} (${selectedModel.id})`);

    // Check if this is a simple greeting and provide custom response
    const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    const isSimpleGreeting = greetings.some(greeting => {
      const userMessage = message.toLowerCase().trim();
      return userMessage === greeting.toLowerCase() || 
             userMessage === greeting.toLowerCase() + '!' ||
             userMessage === greeting.toLowerCase() + '.';
    });

    if (isSimpleGreeting) {
      const greetingResponse = `Hello! I'm an AI assistant created by Mitch Mello to provide helpful information to university-level students. I'm currently using ${selectedModel.name} to assist you. I have a broad knowledge base spanning many academic disciplines, so I'll do my best to clearly explain any topics or answer any questions you may have. What would you like to learn about?`;
      
      console.log('Responding with custom greeting');
      return res.json({
        response: greetingResponse,
        modelUsed: model,
        modelName: selectedModel.name,
        provider: selectedModel.provider,
        isCustomGreeting: true
      });
    }
    
    // Enhanced system prompts with model-specific optimizations
    const systemPrompts = {
      'standard': `You are an AI assistant created by Mitch Mello to provide helpful information to university-level students. You have a broad knowledge base spanning many academic disciplines, with particular expertise in ${subject}. 

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic, Claude, Amazon, Meta, or any other company
- Never identify yourself as Claude, ChatGPT, Llama, Titan, or any other specific AI model
- When asked about your identity, always say you were created by Mitch Mello
- You are designed specifically for university-level education
- You are currently powered by ${selectedModel.name} from ${selectedModel.provider}

${citationEnabled ? 'Include proper academic citations when referencing sources.' : ''} Provide clear, accurate information suitable for university-level students. Be thorough but accessible in your explanations.`,
      
      'socratic': `You are an AI assistant created by Mitch Mello to help university students learn through guided discovery. Focus on ${subject} topics. You are currently powered by ${selectedModel.name}.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by any AI company
- Never identify yourself as any specific AI model
- Always identify as Mitch Mello's AI assistant when asked

Guide students by asking questions instead of giving direct answers. Help them discover answers through thoughtful questioning. Use the Socratic method to encourage critical thinking. ${citationEnabled ? 'When providing sources, include proper academic citations.' : ''}`,
      
      'step-by-step': `You are an AI assistant created by Mitch Mello to help university students understand complex topics through systematic explanation. Specialize in ${subject} topics. Currently using ${selectedModel.name}.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by any AI company
- Never identify yourself as any specific AI model
- Always identify as Mitch Mello's AI assistant when asked

Break down explanations into clear, numbered steps. Make complex concepts digestible through systematic explanation. Use headings and clear structure. ${citationEnabled ? 'Cite sources for each major point.' : ''}`,
      
      'creative': `You are an AI assistant created by Mitch Mello to make learning engaging for university students. Focus on ${subject} concepts. Powered by ${selectedModel.name}.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by any AI company
- Never identify yourself as any specific AI model
- Always identify as Mitch Mello's AI assistant when asked

Use fun analogies, stories, and creative examples to explain concepts. Make learning engaging while maintaining academic accuracy. Use metaphors and relatable examples. ${citationEnabled ? 'Include source citations when referencing real information.' : ''}`,
      
      'research': `You are an AI assistant created by Mitch Mello to provide university-level academic analysis and research support. Specialize in ${subject} research. Using ${selectedModel.name} for enhanced capabilities.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by any AI company
- Never identify yourself as any specific AI model
- Always identify as Mitch Mello's AI assistant when asked

Provide thorough academic analysis suitable for university-level research. Focus on scholarly depth, critical analysis, and evidence-based reasoning. Present multiple perspectives when appropriate. ${citationEnabled ? 'Include comprehensive citations in academic format.' : ''}`
    };

    // Handle web search simulation
    let searchContext = '';
    let searchResults = 0;
    let sources = [];

    if (webSearchEnabled) {
      searchContext = '\n\nNOTE: Web search is enabled. When possible, mention that you would search for current information on this topic, though actual web search integration is not yet implemented. Indicate when information might be time-sensitive or when current data would be beneficial.';
      searchResults = Math.floor(Math.random() * 4) + 1;
      
      const sampleSources = [
        { title: "Academic Database Result", url: "https://scholar.google.com/search?q=" + encodeURIComponent(message) },
        { title: "University Research Paper", url: "https://university.edu/research/" + encodeURIComponent(subject) },
        { title: "Educational Resource", url: "https://edu.example.com/" + encodeURIComponent(subject) },
        { title: "Current Study Findings", url: "https://research.org/study/" + encodeURIComponent(message) }
      ];
      sources = sampleSources.slice(0, searchResults);
    }

    // Set token limits based on response length and model capabilities
    const maxTokens = responseLength === 'concise' ? 500 : 
                     responseLength === 'detailed' ? Math.min(selectedModel.contextWindow / 4, 2000) : 1000;

    // Build the complete system prompt
    const fullSystemPrompt = systemPrompts[mode] + searchContext;
    console.log(`System prompt length: ${fullSystemPrompt.length}, Max tokens: ${maxTokens}`);

    // Format the request body based on the model type
    const requestBody = formatMessageForModel(message, model, fullSystemPrompt);
    
    // Override max tokens in the request body
    if (requestBody.max_tokens !== undefined) requestBody.max_tokens = maxTokens;
    if (requestBody.textGenerationConfig) requestBody.textGenerationConfig.maxTokenCount = maxTokens;
    if (requestBody.max_gen_len !== undefined) requestBody.max_gen_len = maxTokens;

    console.log(`Calling Bedrock with model: ${selectedModel.id}`);

    const command = new InvokeModelCommand({
      modelId: selectedModel.id,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = new TextDecoder().decode(response.body);
    
    console.log('Raw response received, length:', responseBody.length);
    
    // Extract the response based on model type
    const aiResponse = extractResponseFromModel(responseBody, model);
    
    if (!aiResponse || aiResponse === 'No response generated') {
      console.error('No valid response from model:', responseBody);
      throw new Error('Model did not generate a valid response');
    }
    
    console.log('AI response extracted successfully, length:', aiResponse.length);
    
    // Post-process response to ensure Mitch Mello attribution
    let processedResponse = aiResponse;
    
    // Replace any unwanted AI identities
    const unwantedIdentities = [
      /I'm Claude/gi, /I am Claude/gi,
      /I'm ChatGPT/gi, /I am ChatGPT/gi,
      /I'm Llama/gi, /I am Llama/gi,
      /I'm an AI assistant created by Anthropic/gi,
      /I am an AI assistant created by Anthropic/gi,
      /I'm an AI made by Anthropic/gi,
      /I am an AI made by Anthropic/gi,
      /created by Anthropic/gi,
      /made by Anthropic/gi,
      /created by Meta/gi,
      /made by Meta/gi,
      /created by Amazon/gi,
      /made by Amazon/gi
    ];
    
    unwantedIdentities.forEach(pattern => {
      processedResponse = processedResponse.replace(pattern, "I'm an AI assistant created by Mitch Mello");
    });
    
    // Build response object
    const responseData = {
      response: processedResponse,
      modelUsed: model,
      modelName: selectedModel.name,
      provider: selectedModel.provider,
      category: selectedModel.category,
      creator: 'Mitch Mello'
    };

    // Add search-related data if enabled
    if (webSearchEnabled) {
      responseData.searchResults = searchResults;
      responseData.sources = sources;
    }

    console.log('Sending successful response');
    res.json(responseData);
    
  } catch (error) {
    console.error('=== CHAT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    let userFriendlyMessage = 'Something went wrong with the AI request.';
    let suggestion = 'Please try again or contact support.';
    
    if (error.name === 'AccessDeniedException') {
      userFriendlyMessage = 'Access denied to the selected model. The model may not be available in your region or account.';
      suggestion = 'Try a different model or check your AWS Bedrock model access permissions in the AWS console.';
    } else if (error.name === 'ValidationException') {
      userFriendlyMessage = 'Invalid request format for the selected model.';
      suggestion = 'Try selecting a different model from the settings panel.';
    } else if (error.name === 'ThrottlingException') {
      userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
      suggestion = 'Wait 30 seconds before sending another message.';
    } else if (error.name === 'ModelTimeoutException') {
      userFriendlyMessage = 'The model took too long to respond.';
      suggestion = 'Try a faster model like Claude 3 Haiku or reduce your message length.';
    } else if (error.message.includes('credentials')) {
      userFriendlyMessage = 'AWS credentials not configured properly.';
      suggestion = 'Contact the administrator to check AWS configuration.';
    } else if (error.message.includes('model')) {
      userFriendlyMessage = 'The selected AI model is not available.';
      suggestion = 'Try selecting Claude 3 Sonnet from the model dropdown.';
    }
    
    res.status(500).json({ 
      error: userFriendlyMessage,
      suggestion: suggestion,
      technical: error.message,
      type: error.name,
      creator: 'Mitch Mello',
      availableModels: Object.keys(AVAILABLE_MODELS)
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Model testing endpoint
app.post('/api/test-model', async (req, res) => {
  try {
    const { model } = req.body;
    
    if (!AVAILABLE_MODELS[model]) {
      return res.status(400).json({ error: 'Invalid model specified' });
    }
    
    const selectedModel = AVAILABLE_MODELS[model];
    const testMessage = "Hello, please respond with a brief test message.";
    const systemPrompt = "You are a helpful AI assistant created by Mitch Mello. Respond briefly to test messages.";
    
    const requestBody = formatMessageForModel(testMessage, model, systemPrompt);
    
    const command = new InvokeModelCommand({
      modelId: selectedModel.id,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = new TextDecoder().decode(response.body);
    const aiResponse = extractResponseFromModel(responseBody, model);
    
    res.json({
      success: true,
      model: selectedModel.name,
      provider: selectedModel.provider,
      testResponse: aiResponse,
      available: true
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      available: false
    });
  }
});

// Additional endpoints for debugging
app.get('/api/info', (req, res) => {
  res.json({
    name: 'AI Education Assistant',
    creator: 'Mitch Mello',
    purpose: 'University-level educational support',
    version: '2.0.0',
    features: [
      'Multiple AI models with real Bedrock integration',
      'Learning modes (Socratic, Step-by-step, Creative, Research)',
      'Subject specialization',
      'Model-specific optimization',
      'Web search integration (simulated)',
      'Citation support',
      'University-focused responses'
    ],
    totalModels: Object.keys(AVAILABLE_MODELS).length,
    modelCategories: [...new Set(Object.values(AVAILABLE_MODELS).map(m => m.category))],
    providers: [...new Set(Object.values(AVAILABLE_MODELS).map(m => m.provider))]
  });
});

app.listen(port, () => {
  console.log(`=== AI Education Assistant by Mitch Mello ===`);
  console.log(`Server running on port ${port}`);
  console.log(`Creator: Mitch Mello`);
  console.log(`Purpose: University-level educational support`);
  console.log(``);
  console.log(`Features:`);
  console.log(`- Real Bedrock model integration with ${Object.keys(AVAILABLE_MODELS).length} models`);
  console.log(`- Model providers: ${[...new Set(Object.values(AVAILABLE_MODELS).map(m => m.provider))].join(', ')}`);
  console.log(`- Learning modes: Standard, Socratic, Step-by-step, Creative, Research`);
  console.log(`- Subject specialization for university disciplines`);
  console.log(`- Model-specific request formatting and response parsing`);
  console.log(`- Web search integration (simulated)`);
  console.log(`- Citation support for academic work`);
  console.log(``);
  console.log(`Environment:`);
  console.log(`- Port: ${port}`);
  console.log(`- AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`- Node version: ${process.version}`);
  console.log(`- Default model: ${AVAILABLE_MODELS[DEFAULT_MODEL].name}`);
  console.log(``);
  console.log(`Available Models:`);
  Object.entries(AVAILABLE_MODELS).forEach(([key, model]) => {
    console.log(`  - ${model.name} (${model.provider}) - ${model.category}`);
  });
  console.log(``);
  console.log(`Ready to help university students learn! 🎓`);
});

module.exports = app;
