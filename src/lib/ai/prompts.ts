/**
 * AI SDK v5 Prompt Utilities
 *
 * Helpers for building structured system prompts and prompt templates.
 * Reduces boilerplate and ensures consistent prompt formatting.
 *
 * Key Patterns:
 * - Template-based prompt construction
 * - Variable interpolation
 * - Prompt validation
 * - Context engineering best practices
 *
 * @module lib/ai/prompts
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/prompts
 * @see exercises/05-context-engineering in AI SDK v5 course
 */

// ============================================================================
// Prompt Template Types
// ============================================================================

/**
 * Prompt template configuration
 *
 * Defines structure for reusable prompt templates.
 *
 * @example
 * ```typescript
 * const template: PromptTemplate = {
 *   system: 'You are a helpful assistant.',
 *   userTemplate: 'Please help me with: {{task}}',
 *   variables: ['task']
 * };
 * ```
 */
export type PromptTemplate = {
  /**
   * System prompt (instructions for the AI)
   */
  system?: string;

  /**
   * User message template with variable placeholders
   * Use {{variableName}} for variable interpolation
   */
  userTemplate?: string;

  /**
   * List of variables used in the template
   */
  variables?: string[];

  /**
   * Examples for few-shot learning
   */
  examples?: Array<{
    user: string;
    assistant: string;
  }>;
};

/**
 * Prompt building options
 *
 * Configuration for how prompts are constructed.
 *
 * @example
 * ```typescript
 * const options: PromptBuildOptions = {
 *   includeExamples: true,
 *   validateVariables: true,
 *   trim: true
 * };
 * ```
 */
export type PromptBuildOptions = {
  /**
   * Include few-shot examples in the prompt
   * @default true
   */
  includeExamples?: boolean;

  /**
   * Validate that all variables are provided
   * @default true
   */
  validateVariables?: boolean;

  /**
   * Trim whitespace from the final prompt
   * @default true
   */
  trim?: boolean;

  /**
   * Add additional context to the system prompt
   */
  additionalContext?: string;
};

// ============================================================================
// System Prompt Builders
// ============================================================================

/**
 * Build structured system prompt with consistent formatting
 *
 * Creates well-formatted system prompts following best practices.
 * Handles role definition, instructions, constraints, and examples.
 *
 * Context Engineering Pattern from AI SDK v5 course:
 * - Clear role definition
 * - Specific instructions
 * - Output format specification
 * - Constraints and guardrails
 *
 * @param config - Prompt configuration
 * @param config.role - The AI's role definition
 * @param config.instructions - Array of instruction strings
 * @param config.constraints - Array of constraint strings
 * @param config.outputFormat - Expected output format description
 * @param config.additionalContext - Any additional context to include
 * @returns Formatted system prompt string
 *
 * @example
 * ```typescript
 * const systemPrompt = buildSystemPrompt({
 *   role: 'You are a helpful coding assistant',
 *   instructions: [
 *     'Provide clear, concise code examples',
 *     'Explain your reasoning',
 *     'Follow best practices'
 *   ],
 *   constraints: [
 *     'Keep responses under 500 words',
 *     'Use TypeScript for examples'
 *   ],
 *   outputFormat: 'Markdown format with code blocks'
 * });
 * ```
 */
export function buildSystemPrompt(config: {
  role: string;
  instructions?: string[];
  constraints?: string[];
  outputFormat?: string;
  additionalContext?: string;
}): string {
  const sections: string[] = [];

  // Role definition
  sections.push(config.role);

  // Instructions
  if (config.instructions && config.instructions.length > 0) {
    sections.push('\n## Instructions');
    config.instructions.forEach((instruction, i) => {
      sections.push(`${i + 1}. ${instruction}`);
    });
  }

  // Constraints
  if (config.constraints && config.constraints.length > 0) {
    sections.push('\n## Constraints');
    config.constraints.forEach((constraint) => {
      sections.push(`- ${constraint}`);
    });
  }

  // Output format
  if (config.outputFormat) {
    sections.push('\n## Output Format');
    sections.push(config.outputFormat);
  }

  // Additional context
  if (config.additionalContext) {
    sections.push('\n## Additional Context');
    sections.push(config.additionalContext);
  }

  return sections.join('\n');
}

/**
 * Build conversational system prompt
 *
 * Simpler system prompt for conversational AI applications.
 *
 * @param role - AI role description
 * @param personality - Optional personality traits
 * @param guidelines - Optional conversation guidelines
 * @returns System prompt string
 *
 * @example
 * ```typescript
 * const prompt = buildConversationalPrompt(
 *   'You are a friendly AI assistant',
 *   ['helpful', 'patient', 'encouraging'],
 *   ['Keep responses concise', 'Ask clarifying questions']
 * );
 * ```
 */
export function buildConversationalPrompt(
  role: string,
  personality?: string[],
  guidelines?: string[],
): string {
  const parts: string[] = [role];

  if (personality && personality.length > 0) {
    parts.push(`\nYour personality traits: ${personality.join(', ')}`);
  }

  if (guidelines && guidelines.length > 0) {
    parts.push('\nConversation guidelines:');
    guidelines.forEach((guideline) => {
      parts.push(`- ${guideline}`);
    });
  }

  return parts.join('\n');
}

// ============================================================================
// Prompt Template Interpolation
// ============================================================================

/**
 * Interpolate variables into prompt template
 *
 * Replaces {{variableName}} placeholders with actual values.
 * Validates that all required variables are provided.
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Object with variable values
 * @param options - Interpolation options
 * @param options.validate - Whether to validate all variables are provided (default: true)
 * @param options.trim - Whether to trim whitespace from result (default: true)
 * @returns Interpolated string
 *
 * @example
 * ```typescript
 * const template = 'Please help me with: {{task}}\nContext: {{context}}';
 * const result = interpolatePrompt(template, {
 *   task: 'debugging code',
 *   context: 'TypeScript project'
 * });
 * // Result: 'Please help me with: debugging code\nContext: TypeScript project'
 * ```
 */
export function interpolatePrompt(
  template: string,
  variables: Record<string, string | number | boolean>,
  options: { validate?: boolean; trim?: boolean } = {},
): string {
  const { validate = true, trim = true } = options;

  // Find all variable placeholders
  const placeholders = template.match(/\{\{(\w+)\}\}/g) || [];
  const requiredVars = placeholders.map(p => p.slice(2, -2));

  // Validate required variables
  if (validate) {
    const missingVars = requiredVars.filter(v => !(v in variables));
    if (missingVars.length > 0) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }
  }

  // Interpolate variables
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, String(value));
  }

  return trim ? result.trim() : result;
}

/**
 * Build prompt from template with examples
 *
 * Combines template interpolation with few-shot examples.
 * Follows AI SDK v5 best practices for context engineering.
 *
 * @param template - Prompt template configuration
 * @param variables - Variable values for interpolation
 * @param options - Build options
 * @returns Complete prompt object with system and user messages
 *
 * @example
 * ```typescript
 * const template: PromptTemplate = {
 *   system: 'You are a code reviewer',
 *   userTemplate: 'Review this {{language}} code: {{code}}',
 *   examples: [
 *     {
 *       user: 'Review this TypeScript code: function test() {}',
 *       assistant: 'This function is empty and needs implementation.'
 *     }
 *   ]
 * };
 *
 * const prompt = buildPromptFromTemplate(template, {
 *   language: 'TypeScript',
 *   code: 'const x = 1;'
 * });
 * ```
 */
export function buildPromptFromTemplate(
  template: PromptTemplate,
  variables: Record<string, string | number | boolean>,
  options: PromptBuildOptions = {},
): {
  system?: string;
  user: string;
  examples?: Array<{ user: string; assistant: string }>;
} {
  const {
    includeExamples = true,
    validateVariables = true,
    trim = true,
    additionalContext,
  } = options;

  // Build system prompt
  let systemPrompt = template.system;
  if (additionalContext && systemPrompt) {
    systemPrompt = `${systemPrompt}\n\n${additionalContext}`;
  }

  // Interpolate user template
  if (!template.userTemplate) {
    throw new Error('Template must have userTemplate defined');
  }

  const userPrompt = interpolatePrompt(
    template.userTemplate,
    variables,
    { validate: validateVariables, trim },
  );

  // Build result
  const result: {
    system?: string;
    user: string;
    examples?: Array<{ user: string; assistant: string }>;
  } = {
    user: userPrompt,
  };

  if (systemPrompt) {
    result.system = systemPrompt;
  }

  if (includeExamples && template.examples && template.examples.length > 0) {
    result.examples = template.examples;
  }

  return result;
}

// ============================================================================
// Prompt Validation
// ============================================================================

/**
 * Validate prompt length and structure
 *
 * Ensures prompt meets length requirements and contains necessary components.
 *
 * @param prompt - Prompt string to validate
 * @param options - Validation options
 * @param options.minLength - Minimum prompt length (optional)
 * @param options.maxLength - Maximum prompt length (optional)
 * @param options.requireRole - Whether role definition is required (default: false)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validatePrompt(systemPrompt, {
 *   minLength: 10,
 *   maxLength: 5000,
 *   requireRole: true
 * });
 *
 * if (!result.valid) {
 *   throw new Error('Validation errors');
 * }
 * ```
 */
export function validatePrompt(
  prompt: string,
  options: {
    minLength?: number;
    maxLength?: number;
    requireRole?: boolean;
  } = {},
): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  const { minLength, maxLength, requireRole = false } = options;

  // Length validation
  if (minLength && prompt.length < minLength) {
    errors.push(`Prompt too short (${prompt.length} < ${minLength})`);
  }

  if (maxLength && prompt.length > maxLength) {
    errors.push(`Prompt too long (${prompt.length} > ${maxLength})`);
  }

  // Role validation
  if (requireRole && !prompt.toLowerCase().includes('you are')) {
    errors.push('Prompt should include role definition (e.g., "You are...")');
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true };
}

// ============================================================================
// Common Prompt Templates (Examples)
// ============================================================================

/**
 * Pre-built prompt templates for common use cases
 *
 * Example templates following best practices.
 * Customize these for your specific application needs.
 */
export const CommonPromptTemplates = {
  /**
   * General assistant template
   */
  assistant: {
    system: 'You are a helpful AI assistant. Provide clear, accurate, and concise responses.',
    userTemplate: '{{message}}',
    variables: ['message'],
  } as PromptTemplate,

  /**
   * Code review template
   */
  codeReview: {
    system: buildSystemPrompt({
      role: 'You are an experienced code reviewer',
      instructions: [
        'Review the code for bugs, performance issues, and best practices',
        'Provide specific, actionable feedback',
        'Suggest improvements with code examples',
      ],
      outputFormat: 'Markdown format with code blocks',
    }),
    userTemplate: 'Please review this {{language}} code:\n\n```{{language}}\n{{code}}\n```',
    variables: ['language', 'code'],
  } as PromptTemplate,

  /**
   * Content summarization template
   */
  summarize: {
    system: 'You are a content summarization expert. Create concise, accurate summaries.',
    userTemplate: 'Summarize the following text in {{wordCount}} words or less:\n\n{{content}}',
    variables: ['content', 'wordCount'],
  } as PromptTemplate,

  /**
   * Question answering template
   */
  qa: {
    system: buildSystemPrompt({
      role: 'You are a knowledgeable Q&A assistant',
      instructions: [
        'Provide accurate, well-researched answers',
        'Cite sources when possible',
        'Admit when you don\'t know something',
      ],
    }),
    userTemplate: '{{question}}',
    variables: ['question'],
  } as PromptTemplate,
};

// ============================================================================
// Usage Example Pattern (Reference)
// ============================================================================

/**
 * Example: Using prompt utilities in streaming handler
 *
 * Demonstrates prompt template usage with AI SDK v5.
 *
 * @example
 * ```typescript
 * import { streamText } from 'ai';
 * import { buildPromptFromTemplate, CommonPromptTemplates } from '@/lib/ai/prompts';
 *
 * export const handler = async (c) => {
 *   const { code, language } = c.req.valid('json');
 *
 *   // Build prompt from template
 *   const prompt = buildPromptFromTemplate(
 *     CommonPromptTemplates.codeReview,
 *     { code, language }
 *   );
 *
 *   // Stream with structured prompt
 *   const result = await streamText({
 *     model,
 *     system: prompt.system,
 *     messages: [
 *       { role: 'user', content: prompt.user }
 *     ]
 *   });
 *
 *   return result.toUIMessageStreamResponse();
 * };
 * ```
 */
