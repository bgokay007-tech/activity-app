let _io = null;

export const setIO = (io) => { _io = io; };
export const getIO = () => _io;

export const emitToUser = (userId, event, data) => {
    if (_io) _io.to(`user:${userId}`).emit(event, data);
};

export const broadcast = (event, data) => {
    if (_io) _io.emit(event, data);
};
