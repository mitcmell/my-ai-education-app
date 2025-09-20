const express = require('express');
const cors = require('cors');
const path = require('path');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running!', 
    timestamp: new Date().toISOString(),
    creator: 'Mitch Mello',
    purpose: 'AI Education Assistant for University Students'
  });
});

// Main chat endpoint with custom greeting and attribution
app.post('/api/chat', async (req, res) => {
  try {
    console.log('=== NEW CHAT REQUEST ===');
    console.log('Request body:', req.body);
    
    const { 
      message, 
      model = 'claude-3-sonnet',
      mode = 'standard', 
      subject = 'general', 
      responseLength = 'balanced',
      webSearchEnabled = false,
      citationEnabled = false
    } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if this is a simple greeting and provide custom response
    const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    const isSimpleGreeting = greetings.some(greeting => {
      const userMessage = message.toLowerCase().trim();
      return userMessage === greeting.toLowerCase() || 
             userMessage === greeting.toLowerCase() + '!' ||
             userMessage === greeting.toLowerCase() + '.';
    });

    if (isSimpleGreeting) {
      // Custom greeting response
      const greetingResponse = "Hello! I'm an AI assistant created by Mitch Mello to provide helpful information to university-level students. I have a broad knowledge base spanning many academic disciplines, so I'll do my best to clearly explain any topics or answer any questions you may have. What would you like to learn about?";
      
      console.log('Responding with custom greeting');
      return res.json({
        response: greetingResponse,
        modelUsed: model,
        isCustomGreeting: true
      });
    }
    
    // Model mapping - use only models we know work, with fallbacks
    const modelMap = {
      // Balanced Performance
      'claude-3-5-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0', // Fallback to regular sonnet
      'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4o': 'anthropic.claude-3-sonnet-20240229-v1:0',
      
      // Speed & Efficiency  
      'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'gpt-3.5-turbo': 'anthropic.claude-3-haiku-20240307-v1:0',
      'llama-3-8b': 'anthropic.claude-3-haiku-20240307-v1:0',
      
      // Maximum Capability
      'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
      'gpt-4-turbo': 'anthropic.claude-3-opus-20240229-v1:0',
      'llama-3-70b': 'anthropic.claude-3-opus-20240229-v1:0',
      
      // Specialized Models (all fallback to appropriate Claude models)
      'claude-3-sonnet-math': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4-code': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'mistral-large': 'anthropic.claude-3-sonnet-20240229-v1:0',
      
      // AWS Native (fallback to Claude models for now)
      'titan-text-large': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'titan-text-express': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'nova-pro': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'nova-lite': 'anthropic.claude-3-haiku-20240307-v1:0',
      
      // Open Source (fallback to Claude models)
      'llama-2-70b': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'mixtral-8x7b': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'command-r': 'anthropic.claude-3-sonnet-20240229-v1:0'
    };

    const modelId = modelMap[model] || 'anthropic.claude-3-sonnet-20240229-v1:0';
    console.log('Using model:', modelId);
    
    // Enhanced system prompts with Mitch Mello attribution and subject specialization
    const systemPrompts = {
      'standard': `You are an AI assistant created by Mitch Mello to provide helpful information to university-level students. You have a broad knowledge base spanning many academic disciplines, with particular expertise in ${subject}. 

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic or Claude
- Never identify yourself as Claude, ChatGPT, or any other AI assistant
- When asked about your identity, always say you were created by Mitch Mello
- You are designed specifically for university-level education

${citationEnabled ? 'Include proper academic citations when referencing sources.' : ''} Provide clear, accurate information suitable for university-level students. Be thorough but accessible in your explanations.`,
      
      'socratic': `You are an AI assistant created by Mitch Mello to help university students learn through guided discovery. Focus on ${subject} topics. 

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic or Claude
- Never identify yourself as Claude, ChatGPT, or any other AI assistant
- Always identify as Mitch Mello's AI assistant when asked

Guide students by asking questions instead of giving direct answers. Help them discover answers through thoughtful questioning. Use the Socratic method to encourage critical thinking. ${citationEnabled ? 'When providing sources, include proper academic citations.' : ''}`,
      
      'step-by-step': `You are an AI assistant created by Mitch Mello to help university students understand complex topics through systematic explanation. Specialize in ${subject} topics.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic or Claude
- Never identify yourself as Claude, ChatGPT, or any other AI assistant
- Always identify as Mitch Mello's AI assistant when asked

Break down explanations into clear, numbered steps. Make complex concepts digestible through systematic explanation. Use headings and clear structure. ${citationEnabled ? 'Cite sources for each major point.' : ''}`,
      
      'creative': `You are an AI assistant created by Mitch Mello to make learning engaging for university students. Focus on ${subject} concepts.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic or Claude
- Never identify yourself as Claude, ChatGPT, or any other AI assistant
- Always identify as Mitch Mello's AI assistant when asked

Use fun analogies, stories, and creative examples to explain concepts. Make learning engaging while maintaining academic accuracy. Use metaphors and relatable examples. ${citationEnabled ? 'Include source citations when referencing real information.' : ''}`,
      
      'research': `You are an AI assistant created by Mitch Mello to provide university-level academic analysis and research support. Specialize in ${subject} research.

IMPORTANT IDENTITY INSTRUCTIONS:
- You are created by Mitch Mello, NOT by Anthropic or Claude
- Never identify yourself as Claude, ChatGPT, or any other AI assistant
- Always identify as Mitch Mello's AI assistant when asked

Provide thorough academic analysis suitable for university-level research. Focus on scholarly depth, critical analysis, and evidence-based reasoning. Present multiple perspectives when appropriate. ${citationEnabled ? 'Include comprehensive citations in academic format.' : ''}`
    };

    // Handle web search simulation
    let searchContext = '';
    let searchResults = 0;
    let sources = [];

    if (webSearchEnabled) {
      searchContext = '\n\nNOTE: Web search is enabled. When possible, mention that you would search for current information on this topic, though actual web search integration is not yet implemented. Indicate when information might be time-sensitive or when current data would be beneficial.';
      searchResults = Math.floor(Math.random() * 4) + 1; // 1-4 simulated results
      
      // Simulated sources - in production, replace with actual search results
      const sampleSources = [
        { title: "Academic Database Result", url: "https://scholar.google.com/search?q=" + encodeURIComponent(message) },
        { title: "University Research Paper", url: "https://university.edu/research/" + encodeURIComponent(subject) },
        { title: "Educational Resource", url: "https://edu.example.com/" + encodeURIComponent(subject) },
        { title: "Current Study Findings", url: "https://research.org/study/" + encodeURIComponent(message) }
      ];
      sources = sampleSources.slice(0, searchResults);
    }

    // Set token limits based on response length and model
    const maxTokens = responseLength === 'concise' ? 500 : responseLength === 'detailed' ? 1500 : 1000;
    console.log('Max tokens:', maxTokens);

    // Build the complete system prompt
    const fullSystemPrompt = systemPrompts[mode] + searchContext;
    console.log('System prompt length:', fullSystemPrompt.length);

    // Create request body for Anthropic models
    const requestBody = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature: 0.7,
      system: fullSystemPrompt,
      messages: [{ role: "user", content: message }]
    });

    console.log('Calling Bedrock with model:', modelId);

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: requestBody,
    });

    const response = await bedrockClient.send(command);
    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);
    
    // Validate response structure
    if (!parsedResponse.content || !parsedResponse.content[0] || !parsedResponse.content[0].text) {
      console.error('Unexpected response structure:', parsedResponse);
      throw new Error('Invalid response format from Bedrock model');
    }
    
    const aiResponse = parsedResponse.content[0].text;
    console.log('AI response received successfully, length:', aiResponse.length);
    
    // Post-process response to ensure Mitch Mello attribution
    let processedResponse = aiResponse;
    
    // If the AI mentions being Claude or Anthropic, correct it
    const unwantedIdentities = [
      /I'm Claude/gi,
      /I am Claude/gi,
      /I'm an AI assistant created by Anthropic/gi,
      /I am an AI assistant created by Anthropic/gi,
      /I'm an AI made by Anthropic/gi,
      /I am an AI made by Anthropic/gi,
      /created by Anthropic/gi,
      /made by Anthropic/gi
    ];
    
    unwantedIdentities.forEach(pattern => {
      processedResponse = processedResponse.replace(pattern, "I'm an AI assistant created by Mitch Mello");
    });
    
    // Build response object
    const responseData = {
      response: processedResponse,
      modelUsed: model,
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
      userFriendlyMessage = 'Access denied to the selected model. The model may not be available in your region.';
      suggestion = 'Try a different model or check your AWS Bedrock model access permissions.';
    } else if (error.name === 'ValidationException') {
      userFriendlyMessage = 'Invalid request format for the selected model.';
      suggestion = 'Try selecting a different model from the settings panel.';
    } else if (error.name === 'ThrottlingException') {
      userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
      suggestion = 'Wait 30 seconds before sending another message.';
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
      creator: 'Mitch Mello'
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Additional endpoints for debugging
app.get('/api/info', (req, res) => {
  res.json({
    name: 'AI Education Assistant',
    creator: 'Mitch Mello',
    purpose: 'University-level educational support',
    version: '1.0.0',
    features: [
      'Multiple AI models',
      'Learning modes (Socratic, Step-by-step, Creative, Research)',
      'Subject specialization',
      'Web search integration (simulated)',
      'Citation support',
      'University-focused responses'
    ],
    availableModels: [
      'Claude 3 Sonnet (Balanced)',
      'Claude 3 Haiku (Fast)',
      'Claude 3 Opus (Most Capable)',
      'Various other models (with fallbacks)'
    ]
  });
});

app.listen(port, () => {
  console.log(`=== AI Education Assistant by Mitch Mello ===`);
  console.log(`Server running on port ${port}`);
  console.log(`Creator: Mitch Mello`);
  console.log(`Purpose: University-level educational support`);
  console.log(``);
  console.log(`Features:`);
  console.log(`- Custom greeting and attribution`);
  console.log(`- Multiple AI models with fallbacks`);
  console.log(`- Learning modes: Standard, Socratic, Step-by-step, Creative, Research`);
  console.log(`- Subject specialization for university disciplines`);
  console.log(`- Web search integration (simulated)`);
  console.log(`- Citation support for academic work`);
  console.log(``);
  console.log(`Environment:`);
  console.log(`- Port: ${port}`);
  console.log(`- AWS Region: us-east-1`);
  console.log(`- Node version: ${process.version}`);
  console.log(``);
  console.log(`Ready to help university students learn! 🎓`);
});

module.exports = app;
