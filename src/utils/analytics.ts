
export const trackSupportEvent = (eventName: string, params?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, params);
  } else {
    console.log(`[Analytics] ${eventName}`, params);
  }
};

export const trackSupportSearch = (query: string, resultsCount: number) => {
  trackSupportEvent('support_search', { 
    search_term: query, 
    results_count: resultsCount 
  });
};

export const trackSupportArticleView = (articleId: string, title: string) => {
  trackSupportEvent('support_article_view', { 
    article_id: articleId, 
    article_title: title 
  });
};

export const trackSupportCategoryFilter = (category: string) => {
  trackSupportEvent('support_category_filter', { 
    category_id: category 
  });
};

export const trackSupportHelpful = (articleId: string, helpful: boolean) => {
  trackSupportEvent('support_helpful_vote', { 
    article_id: articleId, 
    helpful 
  });
};

