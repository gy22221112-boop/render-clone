const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

module.exports = (storage) => {
  const router = require('express').Router();

  // Регистрация
  router.post('/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (storage.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const user = {
        id: uuidv4(),
        username,
        password: hashedPassword,
        role: 'user',
        createdAt: new Date().toISOString()
      };
      
      storage.users.push(user);
      res.json({ message: 'Регистрация успешна', userId: user.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Вход
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = storage.users.find(u => u.username === username);
      
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Проверка токена
  router.get('/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      res.json({ valid: true, user: decoded });
    } catch (error) {
      res.status(401).json({ error: 'Неверный токен' });
    }
  });

  return router;
};
