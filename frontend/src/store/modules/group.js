import { createGroup } from '@/api/groupServices';

export default {
  namespaced: true,

  state: {
    currentGroup: null,
  },

  mutations: {
    SET_CURRENT_GROUP(state, group) {
      state.currentGroup = group;
    },
  },

  actions: {
    async createNewGroup({ commit }, groupName) {
      try {
        const group = await createGroup(groupName);
        commit('SET_CURRENT_GROUP', group);
        return group;
      } catch (error) {
        console.error('Error creating group:', error);
        if (error.response) {
          throw new Error(error.response.data.message || 'Failed to create group');
        } else {
          throw new Error('Network error occurred');
        }
      }
    },
  },

  getters: {
    getCurrentGroup: (state) => state.currentGroup,
  },
};
