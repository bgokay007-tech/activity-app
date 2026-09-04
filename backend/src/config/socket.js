let _io = null;

export const setIO = (io) => { _io = io; };
export const getIO = () => _io;

export const emitToUser = (userId, event, data) => {
    if (_io) _io.to(`user:${userId}`).emit(event, data);
};

export const broadcast = (event, data) => {
    if (_io) _io.emit(event, data);
};

// Kullanıcı o an hangi sohbeti ekranda açık tutuyor -- o sohbete mesaj gelince push
// bildirimi atlanır (mesaj zaten socket üzerinden anlık düşüyor, ayrıca üstten
// bildirim gelmesi gereksiz bilgi kirliliği oluyordu).
const activeConversations = new Map(); // userId -> conversationId

export const setActiveConversation = (userId, conversationId) => {
    if (conversationId) activeConversations.set(userId, conversationId);
    else activeConversations.delete(userId);
};

export const isViewingConversation = (userId, conversationId) => activeConversations.get(userId) === conversationId;
