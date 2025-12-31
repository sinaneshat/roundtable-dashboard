---
name: ai-sdk-v6
description: Enforce Vercel AI SDK v6 patterns for building AI-powered applications. Use when implementing streamText, generateText, useChat, tools, streaming, multi-provider support, or any AI functionality.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Vercel AI SDK v6 Patterns

## Documentation Links

**Official Documentation:**
- [AI SDK Overview](https://ai-sdk.dev/docs) - Primary reference
- [AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core) - generateText, streamText, generateObject
- [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui) - useChat, useCompletion, useObject
- [Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Streaming](https://ai-sdk.dev/docs/ai-sdk-core/streaming)
- [Providers](https://ai-sdk.dev/docs/foundations/providers)
- [Chatbot with Tools](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)

**Context7 Library IDs (for up-to-date docs):**
```
/vercel/ai - Official AI SDK (versions: ai_5_0_0, ai_6.0.0-beta.128)
/websites/ai-sdk_dev - AI SDK documentation (score: 85, 5353 snippets)
/websites/v6_ai-sdk_dev - AI SDK v6 beta docs (score: 90.8)
/websites/aisdkagents - AI SDK Agents patterns (score: 89.5)
```

**Project-Specific Reference:**
- `.context/ai-sdk-v6-crash-course-full-digest.txt` - Comprehensive crash course with exercises

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topics like "streamText", "useChat tools", "generateObject", "streaming"

## Core Concepts

### Provider Setup

```tsx
// OpenAI
import { openai } from '@ai-sdk/openai'
const model = openai('gpt-4o')

// Anthropic
import { anthropic } from '@ai-sdk/anthropic'
const model = anthropic('claude-sonnet-4-20250514')

// Google
import { google } from '@ai-sdk/google'
const model = google('gemini-2.0-flash')
```

### generateText - Non-Streaming

```tsx
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const { text, usage, finishReason } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'What is the meaning of life?',
  // OR messages for conversation
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
})

console.log(text)
console.log(`Tokens: ${usage.promptTokens} + ${usage.completionTokens}`)
```

### streamText - Streaming Text

```tsx
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'Write a poem about AI.',
})

// Option 1: Iterate over text stream
for await (const textPart of result.textStream) {
  process.stdout.write(textPart)
}

// Option 2: Get full text after streaming
const fullText = await result.text

// Option 3: Return as Response for API routes
return result.toTextStreamResponse()
```

### API Route with streamText (Next.js)

```tsx
// app/api/chat/route.ts
import { streamText, UIMessage, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
```

## useChat Hook (Client-Side)

### Basic Setup

```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i}>{part.text}</span>
            }
            return null
          })}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

### useChat with sendMessage Pattern

```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

export default function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <p key={i}>{part.text}</p>
              case 'tool-weather':
                return <WeatherCard key={i} data={part.output} />
            }
          })}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={isLoading}>Send</button>
      </form>
    </div>
  )
}
```

## Tool Calling

### Defining Tools (Server-Side)

```tsx
import { streamText, tool } from 'ai'
import { z } from 'zod'

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: {
    // Server-side tool with execute function
    getWeather: tool({
      description: 'Get weather for a location',
      parameters: z.object({
        city: z.string().describe('The city to get weather for'),
      }),
      execute: async ({ city }) => {
        // Fetch weather data
        const weather = await fetchWeather(city)
        return { temperature: weather.temp, conditions: weather.conditions }
      },
    }),

    // Client-side tool (no execute - handled on client)
    askForConfirmation: tool({
      description: 'Ask user for confirmation',
      parameters: z.object({
        message: z.string().describe('The confirmation message'),
      }),
      // No execute = client-side tool
    }),
  },
})
```

### Alternative Tool Definition with inputSchema

```tsx
tools: {
  getWeather: {
    description: 'Get weather for a location',
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({ city }) => {
      return { temperature: 72, conditions: 'sunny' }
    },
  },
}
```

### Handling Tools on Client

```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'

export default function Chat() {
  const { messages, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),

    // Auto-submit when tool calls complete
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    // Handle client-side tool execution
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return

      if (toolCall.toolName === 'getLocation') {
        addToolOutput({
          tool: 'getLocation',
          toolCallId: toolCall.toolCallId,
          output: navigator.geolocation ? 'New York' : 'Unknown',
        })
      }
    },
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <span key={i}>{part.text}</span>

              case 'tool-askForConfirmation':
                if (part.state === 'input-available') {
                  return (
                    <div key={i}>
                      <p>{part.input.message}</p>
                      <button
                        onClick={() =>
                          addToolOutput({
                            tool: 'askForConfirmation',
                            toolCallId: part.toolCallId,
                            output: 'confirmed',
                          })
                        }
                      >
                        Confirm
                      </button>
                    </div>
                  )
                }
                if (part.state === 'output-available') {
                  return <p key={i}>Confirmed: {part.output}</p>
                }
                return null
            }
          })}
        </div>
      ))}
    </div>
  )
}
```

## Structured Output (generateObject/streamObject)

### generateObject

```tsx
import { generateObject } from 'ai'
import { z } from 'zod'

const { object } = await generateObject({
  model: openai('gpt-4o'),
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.string(),
      })),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a recipe for chocolate chip cookies.',
})

console.log(object.recipe.name)
```

### streamObject

```tsx
import { streamObject } from 'ai'
import { z } from 'zod'

const { partialObjectStream } = streamObject({
  model: openai('gpt-4o'),
  schema: z.object({
    characters: z.array(z.object({
      name: z.string(),
      class: z.string(),
      description: z.string(),
    })),
  }),
  prompt: 'Generate 3 RPG characters.',
})

for await (const partialObject of partialObjectStream) {
  console.log(partialObject) // Partial object as it streams
}
```

## Message Types

### UIMessage vs ModelMessage

```tsx
import { UIMessage, ModelMessage, convertToModelMessages } from 'ai'

// UIMessage - from useChat (client-side format)
const uiMessages: UIMessage[] = [
  {
    id: '1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
  },
]

// Convert to ModelMessage for API
const modelMessages = await convertToModelMessages(uiMessages)

// ModelMessage - for generateText/streamText
const messages: ModelMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
]
```

## Multi-Step Tool Execution

```tsx
import { streamText, stepCountIs } from 'ai'

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: { /* ... */ },
  // Stop after 5 steps (tool calls + responses)
  stopWhen: stepCountIs(5),
})
```

## Streaming Custom Data

```tsx
// Server: Send custom data alongside text
import { streamText, createDataStream } from 'ai'

export async function POST(req: Request) {
  const dataStream = createDataStream({
    execute: async (writer) => {
      // Send custom data
      writer.writeData({ type: 'status', value: 'thinking' })

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        onFinish: () => {
          writer.writeData({ type: 'status', value: 'complete' })
        },
      })

      result.mergeInto(writer)
    },
  })

  return dataStream.toResponse()
}
```

## Error Handling

```tsx
import { streamText, APICallError } from 'ai'

try {
  const result = await streamText({
    model: openai('gpt-4o'),
    prompt: 'Hello',
  })
} catch (error) {
  if (error instanceof APICallError) {
    console.error('API Error:', error.message)
    console.error('Status:', error.statusCode)
  }
}
```

## Anti-Patterns to Avoid

### 1. Not Converting UI Messages

```tsx
// BAD - UIMessage format won't work with streamText
const result = streamText({
  model,
  messages: uiMessages, // Wrong format!
})

// GOOD - Convert first
const result = streamText({
  model,
  messages: await convertToModelMessages(uiMessages),
})
```

### 2. Missing Tool Output Handling

```tsx
// BAD - Tool calls never complete
case 'tool-confirm':
  return <div>{part.input.message}</div> // No way to respond!

// GOOD - Provide response mechanism
case 'tool-confirm':
  return (
    <button onClick={() => addToolOutput({
      tool: 'confirm',
      toolCallId: part.toolCallId,
      output: 'yes',
    })}>
      Confirm
    </button>
  )
```

### 3. Using Wrong Response Method

```tsx
// BAD - Plain text response loses metadata
return result.toTextStreamResponse()

// GOOD - UI message stream preserves tool calls, metadata
return result.toUIMessageStreamResponse()
```

## Crash Course Exercises Reference

The `.context/ai-sdk-v6-crash-course-full-digest.txt` contains comprehensive exercises:

```
01-ai-sdk-basics/     # Fundamentals: generateText, streamText, UI streams
02-llm-fundamentals/  # Tokens, usage, context window, prompt caching
03-agents/            # Tool calling, MCP, message parts
04-persistence/       # onFinish, chat persistence, message validation
05-context-engineering/ # Prompting, exemplars, retrieval, chain-of-thought
06-evals/             # Evalite, LLM-as-judge, Langfuse
07-streaming/         # Custom data parts, message metadata, error handling
08-agents-workflows/  # Workflows, agent loops, breaking early
09-advanced-patterns/ # Guardrails, model router, research workflows
99-reference/         # UIMessage vs ModelMessage, tool definitions
```

## Project-Specific Notes

This project uses AI SDK with:
- API routes in `src/api/routes/chat/`
- Streaming handlers in `src/api/routes/chat/handlers/`
- Chat services in `src/api/services/`
- React hooks integrating with useChat patterns
