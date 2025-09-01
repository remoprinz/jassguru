export interface JassContentMetadata {
  id: string;
  category: {
    main: string;
    sub: string;
    topic: string;
  };
  keywords: string[];
  situations: string[];
  importance: number;
  difficulty: number;
  source: string;
  chunkInfo: {
    isPartOfSequence: boolean;
    sequenceId: string | null;
    index: number | null;
    total: number | null;
    previousChunkId: string | null;
    nextChunkId: string | null;
  };
  relatedRules?: string[];
  references?: {
    ruleId: string;
    type: string;
    description: string;
  }[];
}

export interface JassContentItem {
  id: string;
  text: string;
  metadata: JassContentMetadata;
}

export type JassContentRecord = Record<string, JassContentItem>; 