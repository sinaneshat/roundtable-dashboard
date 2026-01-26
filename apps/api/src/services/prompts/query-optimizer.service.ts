export function simpleOptimizeQuery(userQuery: string): string {
  let optimized = userQuery.trim();

  if (!optimized) {
    return '';
  }

  const initialWordCount = optimized.split(/\s+/).length;
  const isLongMessage = optimized.length > 200 || initialWordCount > 30;

  const instructionPatterns = /\b(?:continue|fix|make sure|ensure|always|never|don't|do not|must|should not|avoid|follow|learn|refactor|clean up|update|migrate|check|verify|run|test|write|implement|add|remove|delete|create)\b/i;
  const hasInstructionPatterns = instructionPatterns.test(optimized);

  if (isLongMessage && hasInstructionPatterns) {
    const technicalTerms: string[] = [];

    // Simple PascalCase word extraction - avoids ReDoS by using bounded quantifiers

    const capitalizedWords = optimized.match(/\b[A-Z][a-zA-Z]{0,30}\b/g) || [];
    technicalTerms.push(...capitalizedWords);

    const techTermPatterns = [
      /\b(typescript|javascript|eslint|react|vue|angular|next\.?js|node\.?js|python|java|rust|go)\b/gi,
      /\b(api|rest|graphql|database|sql|nosql|mongodb|postgres|mysql)\b/gi,
      /\b(test|tests|testing|unit|integration|e2e|jest|vitest|cypress)\b/gi,
      /\b(type|types|interface|interfaces|enum|enums|schema|schemas|zod)\b/gi,
      /\b(error|errors|bug|bugs|fix|fixes|issue|issues)\b/gi,
      /\b(pattern|patterns|practice|practices|convention|conventions)\b/gi,
      /\b(store|state|hook|hooks|component|components|service|services)\b/gi,
    ];

    techTermPatterns.forEach((pattern) => {
      const matches = optimized.match(pattern) || [];
      technicalTerms.push(...matches);
    });

    const uniqueTerms = [...new Set(technicalTerms.map(t => t.toLowerCase()))];

    if (uniqueTerms.length >= 2) {
      const queryTerms = uniqueTerms.slice(0, 8);
      return `${queryTerms.join(' ')} best practices`;
    }

    const stripped = optimized
      .replace(/\b(continue|fix|make sure|ensure|always|never|don't|do not|must|should not|avoid|follow|learn|refactor|clean up|update|migrate|check|verify|run|write|implement|add|remove|delete|create|and|or|the|a|an|to|for|in|on|at|of|with|that|this|these|those|any|all|no|not|is|are|was|were|be|been|being|have|has|had|will|would|could|should|can|may|might)\b/gi, ' ')
      .replace(/[^a-z0-9\s.-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = stripped.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      return words.slice(0, 10).join(' ');
    }
  }

  const profanityPatterns = [
    /\b(fuck|fucking|fucked|shit|shitty|damn|damned|hell|crap|crappy|ass|asshole)\b/gi,
    /\bwtf\b/gi,
    /\bomg\b/gi,
    /\bffs\b/gi,
  ];
  profanityPatterns.forEach((pattern) => {
    optimized = optimized.replace(pattern, ' ');
  });

  const slangPatterns = [
    /\bidk\b/gi,
    /\btbh\b/gi,
    /\bimho\b/gi,
    /\bimo\b/gi,
    /\bpls\b/gi,
    /\bthx\b/gi,
    /\bbtw\b/gi,
  ];
  slangPatterns.forEach((pattern) => {
    optimized = optimized.replace(pattern, ' ');
  });

  optimized = optimized.replace(/\b(I'm|I am|I've|I have|I'll|I will|I'd|I would)\b/gi, ' ');
  optimized = optimized.replace(/\bI\b/g, ' ');
  optimized = optimized.replace(/\b(my|me|mine|myself)\b/gi, ' ');

  optimized = optimized.replace(/\b(you're|you are|you've|you have|you'll|you will)\b/gi, ' ');
  optimized = optimized.replace(/\b(you|your|yours|yourself)\b/gi, ' ');

  optimized = optimized.replace(/\b(can't|won't|don't|doesn't|didn't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't)\b/gi, ' ');

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

  optimized = optimized.replace(/\b(right now|at the moment|these days|nowadays)\b/gi, ' ');
  optimized = optimized.replace(/\b(half the time|all the time|sometimes)\b/gi, ' ');
  optimized = optimized.replace(/\b(please|pls|can someone|someone please)\b/gi, ' ');
  optimized = optimized.replace(/\b(help me|help|explain|tell me|show me|give me|need|get|got|getting)\b/gi, ' ');
  optimized = optimized.replace(/\b(going|go|do|doing|done)\b/gi, ' ');

  optimized = optimized.replace(
    /^(what|how|why|when|where|who|which|what's|how's|why's|where's)\s+/i,
    '',
  );

  optimized = optimized.replace(/^the\s+/i, '');
  optimized = optimized.replace(/^(so|well|okay|ok|alright|hey|hi)\s+/i, '');

  // Simplified pattern to avoid ReDoS - matches "X vs Y" or "X or Y" comparisons
  const comparisonMatch = optimized.match(/\b([A-Z][\w.]{0,30})\s+(?:or|versus|vs)\s+([A-Z][\w.]{0,30})(?:\s|$)/i);
  if (comparisonMatch) {
    const entity1 = comparisonMatch[1]?.trim();
    const entity2 = comparisonMatch[2]?.trim();
    if (entity1 && entity2) {
      let mainTopic = optimized
        .replace(new RegExp(`\\b${entity1}\\b`, 'gi'), '')
        .replace(new RegExp(`\\b${entity2}\\b`, 'gi'), '')
        .replace(/\b(or|versus|vs)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      const hasComparison = /\bcomparison\b/i.test(mainTopic);
      if (hasComparison) {
        mainTopic = mainTopic.replace(/\bcomparison\b/gi, '').replace(/\s+/g, ' ').trim();
      }
      optimized = mainTopic
        ? `${entity1} vs ${entity2} ${mainTopic} comparison`.trim()
        : `${entity1} vs ${entity2} comparison`.trim();
    }
  }

  optimized = optimized.replace(/\b(should|could|would|might|may|can|will|shall)\b/gi, ' ');
  optimized = optimized.replace(/\b(trying to|want to|need to|have to|got to|gotta)\b/gi, ' ');
  optimized = optimized.replace(/\b(decide|deciding|decision|choose|choosing)\b/gi, ' ');

  optimized = optimized.replace(/\bif\s+/gi, ' ');
  optimized = optimized.replace(
    /\b(the|a|an|and|or|but|for|to|in|on|at|of|with|about|from|by|as|into|through)\b/gi,
    ' ',
  );

  // Remove auxiliary/helping verbs and remaining question words
  optimized = optimized.replace(/\b(is|are|was|were|be|been|being|have|has|had|do|does|did)\b/gi, ' ');
  optimized = optimized.replace(/\b(what|which|where|when|who|why|how)\b/gi, ' ');
  optimized = optimized.replace(/\b(now|while|out|this|that|these|those|here|there)\b/gi, ' ');
  optimized = optimized.replace(/\bnext\b(?!\.js)/gi, (match) => {
    return match.startsWith('N') ? match : ' ';
  });
  optimized = optimized.replace(/\b(something|anything|everything|nothing|else|entirely|just|only)\b/gi, ' ');
  optimized = optimized.replace(/\b(working|figure|handle)\b/gi, ' ');
  optimized = optimized.replace(/[.?!;:,]+$/g, '');
  optimized = optimized.replace(/^[.?!;:,]+/g, '');
  optimized = optimized.replace(/\s+/g, ' ').trim();
  optimized = optimized.replace(/[,;:]+/g, ' ').trim();
  optimized = optimized.replace(/\.(?!js|ts|py|go|rb|php|java|cpp|cs\b)/g, ' ').trim();
  optimized = optimized.replace(/\s+/g, ' ').trim();
  const wordCount = optimized.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount > 0) {
    if (wordCount === 1 && !/definition|explanation|guide|tutorial/i.test(optimized)) {
      optimized += ' definition explanation';
    } else if (wordCount === 2 && !/guide|tutorial|example|definition|comparison/i.test(optimized)) {
      optimized += ' guide';
    }
  }

  const hasTrendingKeywords = /latest|recent|new|current|today|trending|best|top|trends|advice|right now/i.test(userQuery);
  const hasFinancialKeywords = /investment|invest|stock|crypto|bitcoin|ethereum|financial|finance|trading|market/i.test(userQuery);
  const hasYearAlready = /202\d/.test(optimized);

  if ((hasTrendingKeywords || hasFinancialKeywords) && !hasYearAlready) {
    optimized += ' 2025';
  }

  if (/^how\s+/i.test(userQuery) && !/tutorial|guide|step/i.test(optimized)) {
    optimized += ' tutorial';
  }
  optimized = optimized.replace(/\s+/g, ' ').trim();
  optimized = optimized.replace(/\s[,;:.!?]\s/g, ' ').trim();

  const finalResult = optimized.trim();
  if (finalResult === userQuery.trim()) {
    return `${finalResult} 2025`.trim();
  }

  if (!finalResult) {
    const capitalizedWords = userQuery.match(/\b[A-Z][a-zA-Z]+\b/g);
    if (capitalizedWords && capitalizedWords.length > 0) {
      return capitalizedWords.join(' ').trim();
    }

    let fallback = userQuery
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

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

export function isOptimizedQuery(query: string): boolean {
  if (!query || query.trim().length === 0) {
    return false;
  }

  const trimmed = query.trim();

  if (/^(?:what|how|why|when|where|who|which)\s+/i.test(trimmed)) {
    return false;
  }

  if (trimmed.endsWith('?')) {
    return false;
  }

  return true;
}

export function isQuerySearchable(query: string): boolean {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed || trimmed.length < 2) {
    return false;
  }

  const greetings = new Set(['hi', 'hello', 'hey', 'yo', 'sup', 'howdy', 'hiya', 'hola', 'bonjour']);
  if (greetings.has(trimmed)) {
    return false;
  }

  const nonSearchableWords = new Set([
    'ok',
    'okay',
    'yes',
    'no',
    'sure',
    'thanks',
    'thank',
    'thx',
    'please',
    'pls',
    'help',
    'hmm',
    'um',
    'uh',
    'eh',
    'ah',
  ]);
  if (nonSearchableWords.has(trimmed)) {
    return false;
  }

  const fillerWords = new Set([
    'say',
    'tell',
    'give',
    'show',
    'do',
    'run',
    'make',
    'just',
    'let',
    'get',
    'me',
    'i',
    'my',
    'you',
    'your',
    'the',
    'a',
    'an',
    'it',
    'this',
    'that',
    'word',
    'words',
    'only',
    'onyl',
    'one',
    'please',
    'pls',
    'now',
    'here',
    'something',
    'anything',
    'nothing',
    'thing',
    'stuff',
    'things',
    'want',
    'need',
    'like',
    'know',
    'think',
    'go',
    'going',
    'be',
    'am',
    'is',
    'are',
    'can',
    'could',
    'would',
    'should',
    'will',
    'shall',
    'may',
    'might',
    'to',
    'for',
    'of',
    'in',
    'on',
    'at',
    'by',
    'with',
    'from',
    'about',
    'and',
    'or',
    'but',
    'so',
    'if',
    'then',
    'else',
    'when',
    'where',
    'what',
    'how',
    'why',
    'who',
  ]);

  // Split into words and remove punctuation
  const words = trimmed
    .replace(/[,;:.!?'"]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const techTerms = new Set([
    'ai',
    'ml',
    'api',
    'css',
    'sql',
    'aws',
    'gcp',
    'npm',
    'git',
    'cli',
    'gui',
    'ui',
    'ux',
    'db',
    'os',
    'vm',
    'ci',
    'cd',
    'qa',
    'js',
    'ts',
    'py',
    'go',
    'c',
  ]);

  const meaningfulWords = words.filter((w) => {
    if (techTerms.has(w)) {
      return true;
    }
    return !fillerWords.has(w) && w.length > 2;
  });

  const capitalizedInOriginal = query.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
  const hasTechTerms = capitalizedInOriginal.some(word =>
    !fillerWords.has(word.toLowerCase())
    && !greetings.has(word.toLowerCase())
    && !nonSearchableWords.has(word.toLowerCase()),
  );

  return meaningfulWords.length > 0 || hasTechTerms;
}
