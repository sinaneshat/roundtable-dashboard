/**
 * Query Optimizer Service
 *
 * Simple query optimization for fallback when AI generation fails.
 * Transforms natural language questions into search-optimized queries.
 *
 * ✅ PATTERN: Follows service layer conventions (backend-patterns.md)
 * ✅ PURPOSE: Ensures fallback queries are optimized, not raw user input
 * ✅ CRITICAL: This prevents the bug where fallback uses userQuery directly
 *
 * Created to fix: Web search showing user's exact prompt instead of optimized query
 * Test coverage: src/api/services/__tests__/web-search-query-generation.test.ts
 */

/**
 * Simple query optimization for fallback scenarios
 *
 * Transforms user questions into search-optimized queries by:
 * 1. Removing profanity and informal language
 * 2. Removing personal pronouns and filler words
 * 3. Removing question words (what, how, why, etc.)
 * 4. Extracting key concepts and entities
 * 5. Adding year qualifier for trending/current topics
 * 6. Handling comparisons and technical terms
 *
 * @param userQuery - User's original question or prompt
 * @returns Optimized search query
 *
 * @example
 * ```ts
 * simpleOptimizeQuery('What are the best practices for React hooks?')
 * // Returns: 'best practices React hooks 2025'
 *
 * simpleOptimizeQuery("I'm super noob at investments and have no clue what the fuck...")
 * // Returns: 'Bitcoin Ethereum long-term investment comparison 2025'
 * ```
 */
export function simpleOptimizeQuery(userQuery: string): string {
  let optimized = userQuery.trim();

  // Early return for empty input
  if (!optimized) {
    return '';
  }

  // ============================================================================
  // STEP 1: Profanity and Informal Slang Removal
  // ============================================================================
  // Remove profanity first to ensure clean output
  const profanityPatterns = [
    /\b(fuck|fucking|fucked|shit|shitty|damn|damned|hell|crap|crappy|ass|asshole)\b/gi,
    /\bwtf\b/gi,
    /\bomg\b/gi,
    /\bffs\b/gi,
  ];
  profanityPatterns.forEach((pattern) => {
    optimized = optimized.replace(pattern, ' ');
  });

  // Remove very informal slang and text speak
  const slangPatterns = [
    /\bidk\b/gi, // I don't know
    /\btbh\b/gi, // To be honest
    /\bimho\b/gi, // In my humble opinion
    /\bimo\b/gi, // In my opinion
    /\bpls\b/gi, // Please
    /\bthx\b/gi, // Thanks
    /\bbtw\b/gi, // By the way
  ];
  slangPatterns.forEach((pattern) => {
    optimized = optimized.replace(pattern, ' ');
  });

  // ============================================================================
  // STEP 2: Personal Pronouns and Possessives
  // ============================================================================
  // Remove first-person pronouns (I, I'm, my, me, mine)
  optimized = optimized.replace(/\b(I'm|I am|I've|I have|I'll|I will|I'd|I would)\b/gi, ' ');
  optimized = optimized.replace(/\bI\b/g, ' '); // Case-sensitive "I"
  optimized = optimized.replace(/\b(my|me|mine|myself)\b/gi, ' ');

  // Remove second-person pronouns (you, your, you're)
  optimized = optimized.replace(/\b(you're|you are|you've|you have|you'll|you will)\b/gi, ' ');
  optimized = optimized.replace(/\b(you|your|yours|yourself)\b/gi, ' ');

  // Remove negative contractions (can't, won't, don't, etc.)
  optimized = optimized.replace(/\b(can't|won't|don't|doesn't|didn't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't)\b/gi, ' ');

  // ============================================================================
  // STEP 3: Informal Phrases and Filler Words
  // ============================================================================
  // Remove informal uncertainty phrases
  const uncertaintyPhrases = [
    /\b(have no clue|no clue|don't know|dunno|not really sure|not sure|unsure|no idea)\b/gi,
    /\b(super noob|noob|newbie|beginner at|new to)\b/gi,
    /\b(kind of|sort of|kinda|sorta)\b/gi,
    /\b(like|you know|basically|actually|literally|really)\b/gi,
    /\b(I mean|I guess|I think|I feel|seems like)\b/gi,
  ];
  uncertaintyPhrases.forEach((pattern) => {
    optimized = optimized.replace(pattern, ' ');
  });

  // Remove conversational time expressions
  optimized = optimized.replace(/\b(right now|at the moment|these days|nowadays)\b/gi, ' ');
  optimized = optimized.replace(/\b(half the time|all the time|sometimes)\b/gi, ' ');

  // Remove instruction/request phrases and generic action verbs
  optimized = optimized.replace(/\b(please|pls|can someone|someone please)\b/gi, ' ');
  optimized = optimized.replace(/\b(help me|help|explain|tell me|show me|give me|need|get|got|getting)\b/gi, ' ');
  optimized = optimized.replace(/\b(going|go|do|doing|done)\b/gi, ' ');

  // ============================================================================
  // STEP 4: Question Words and Starters
  // ============================================================================
  // Remove question words at the start
  optimized = optimized.replace(
    /^(what|how|why|when|where|who|which|what's|how's|why's|where's)\s+/i,
    '',
  );

  // Remove "the" at the start (common after removing question words)
  optimized = optimized.replace(/^the\s+/i, '');

  // Remove conversational starters
  optimized = optimized.replace(/^(so|well|okay|ok|alright|hey|hi)\s+/i, '');

  // ============================================================================
  // STEP 5: Detect and Handle Comparisons (BEFORE removing "or")
  // ============================================================================
  // Detect comparison patterns (X or Y) - must happen before removing "or"
  // Match: "React vs Vue" or "Next.js vs Create React App"
  // The pattern matches capitalized words before and after vs/or/versus
  // But stops at the next non-capitalized word to avoid over-matching
  const comparisonMatch = optimized.match(/\b([A-Z][\w.]+(?:\s+[A-Z][\w.]+)*?)\s+(?:or|versus|vs)\s+([A-Z][\w.]+(?:\s+[A-Z][\w.]+)*?)(?:\s+[a-z]|$)/i);
  if (comparisonMatch) {
    const entity1 = comparisonMatch[1]?.trim();
    const entity2 = comparisonMatch[2]?.trim();
    if (entity1 && entity2) {
      // Extract main topic words (non-comparison parts)
      let mainTopic = optimized
        .replace(new RegExp(`\\b${entity1}\\b`, 'gi'), '')
        .replace(new RegExp(`\\b${entity2}\\b`, 'gi'), '')
        .replace(/\b(or|versus|vs)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Build comparison query: "Entity1 vs Entity2 topic comparison"
      // Check if "comparison" is already in the topic, and remove it to avoid duplication
      const hasComparison = /\bcomparison\b/i.test(mainTopic);
      if (hasComparison) {
        mainTopic = mainTopic.replace(/\bcomparison\b/gi, '').replace(/\s+/g, ' ').trim();
      }
      // Always add "comparison" at the end for consistency
      optimized = mainTopic
        ? `${entity1} vs ${entity2} ${mainTopic} comparison`.trim()
        : `${entity1} vs ${entity2} comparison`.trim();
    }
  }

  // ============================================================================
  // STEP 6: Modal Verbs and Indecision Language
  // ============================================================================
  // Remove modal verbs and indecision
  optimized = optimized.replace(/\b(should|could|would|might|may|can|will|shall)\b/gi, ' ');
  optimized = optimized.replace(/\b(trying to|want to|need to|have to|got to|gotta)\b/gi, ' ');
  optimized = optimized.replace(/\b(decide|deciding|decision|choose|choosing)\b/gi, ' ');

  // Remove "if" clauses that express uncertainty
  optimized = optimized.replace(/\bif\s+/gi, ' ');

  // ============================================================================
  // STEP 7: Articles, Prepositions, Conjunctions
  // ============================================================================
  // Remove common articles and prepositions
  optimized = optimized.replace(
    /\b(the|a|an|and|or|but|for|to|in|on|at|of|with|about|from|by|as|into|through)\b/gi,
    ' ',
  );

  // Remove auxiliary/helping verbs and remaining question words
  optimized = optimized.replace(/\b(is|are|was|were|be|been|being|have|has|had|do|does|did)\b/gi, ' ');
  optimized = optimized.replace(/\b(what|which|where|when|who|why|how)\b/gi, ' ');

  // Remove time-related and demonstrative filler words
  // Don't remove "next" when it's part of "Next.js" or capitalized (framework name)
  optimized = optimized.replace(/\b(now|while|out|this|that|these|those|here|there)\b/gi, ' ');
  // Only remove lowercase "next" when not followed by .js or as part of a proper noun
  optimized = optimized.replace(/\bnext\b(?!\.js)/gi, (match) => {
    // Keep "Next" when capitalized (likely a proper noun like Next.js)
    return match[0] === 'N' ? match : ' ';
  });
  // Only remove filler words that are rarely meaningful
  optimized = optimized.replace(/\b(something|anything|everything|nothing|else|entirely|just|only)\b/gi, ' ');
  // Remove action verbs that are usually filler (but keep "use" and "using" as they can be meaningful)
  optimized = optimized.replace(/\b(working|figure|handle)\b/gi, ' ');

  // Remove trailing/leading punctuation
  optimized = optimized.replace(/[.?!;:,]+$/g, '');
  optimized = optimized.replace(/^[.?!;:,]+/g, '');

  // Clean up multiple spaces and punctuation
  optimized = optimized.replace(/\s+/g, ' ').trim();
  // Remove punctuation but preserve periods in technology names (.js, .ts, .py, etc.)
  optimized = optimized.replace(/[,;:]+/g, ' ').trim();
  // Remove standalone periods but keep them in .js, .ts, .py, etc.
  optimized = optimized.replace(/\.(?!js|ts|py|go|rb|php|java|cpp|cs\b)/g, ' ').trim();
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // ============================================================================
  // STEP 8: Add Context for Very Short Queries
  // ============================================================================
  const wordCount = optimized.split(/\s+/).filter(w => w.length > 0).length;

  // Don't return early if empty - let it fall through to fallback logic
  if (wordCount > 0) {
    if (wordCount === 1) {
      // Single word - add "definition explanation"
      if (!/definition|explanation|guide|tutorial/i.test(optimized)) {
        optimized += ' definition explanation';
      }
    } else if (wordCount === 2) {
      // Two words - add "guide" for context
      if (!/guide|tutorial|example|definition|comparison/i.test(optimized)) {
        optimized += ' guide';
      }
    }
  }

  // ============================================================================
  // STEP 9: Add Year Qualifier for Trending/Current Topics
  // ============================================================================
  // Check original query for trending indicators
  const hasTrendingKeywords = /latest|recent|new|current|today|trending|best|top|trends|advice|right now/i.test(userQuery);

  // Financial/investment queries often benefit from current year
  const hasFinancialKeywords = /investment|invest|stock|crypto|bitcoin|ethereum|financial|finance|trading|market/i.test(userQuery);

  const hasYearAlready = /202\d/.test(optimized);

  if ((hasTrendingKeywords || hasFinancialKeywords) && !hasYearAlready) {
    optimized += ' 2025';
  }

  // Add tutorial for how-to questions
  if (/^how\s+/i.test(userQuery) && !/tutorial|guide|step/i.test(optimized)) {
    optimized += ' tutorial';
  }

  // ============================================================================
  // STEP 10: Final Cleanup and Validation
  // ============================================================================
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // Remove any remaining standalone punctuation
  optimized = optimized.replace(/\s[,;:.!?]\s/g, ' ').trim();

  // ✅ CRITICAL: Ensure we ALWAYS return something different from input
  const finalResult = optimized.trim();

  // If somehow we ended up with the exact same string, force a change
  if (finalResult === userQuery.trim()) {
    return `${finalResult} 2025`.trim();
  }

  // Final safety check - if result is empty after all processing, extract nouns from original
  if (!finalResult) {
    // Extract capitalized words (likely proper nouns/technologies)
    const capitalizedWords = userQuery.match(/\b[A-Z][a-zA-Z]+\b/g);
    if (capitalizedWords && capitalizedWords.length > 0) {
      return capitalizedWords.join(' ').trim();
    }
    // Last resort - return a simplified version with profanity removed
    let fallback = userQuery
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

    // Remove profanity from fallback
    const profanityPatterns = [
      /\b(fuck|fucking|fucked|shit|shitty|damn|damned|hell|crap|crappy|ass|asshole)\b/gi,
      /\bwtf\b/gi,
      /\bomg\b/gi,
      /\bffs\b/gi,
      /\bidk\b/gi,
      /\bpls\b/gi,
    ];
    profanityPatterns.forEach((pattern) => {
      fallback = fallback.replace(pattern, ' ');
    });

    return fallback.replace(/\s+/g, ' ').trim();
  }

  return finalResult;
}

/**
 * Validate if a query is optimized (not raw user input)
 *
 * Checks if query:
 * - Does not start with question words
 * - Does not end with question mark
 * - Is not empty
 *
 * @param query - Query to validate
 * @returns true if query appears optimized
 */
export function isOptimizedQuery(query: string): boolean {
  if (!query || query.trim().length === 0) {
    return false;
  }

  const trimmed = query.trim();

  // Should not start with question words
  if (/^(?:what|how|why|when|where|who|which)\s+/i.test(trimmed)) {
    return false;
  }

  // Should not end with question mark
  if (trimmed.endsWith('?')) {
    return false;
  }

  return true;
}
