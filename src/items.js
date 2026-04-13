import { randomUUID } from 'node:crypto';

/// Создаёт репозиторий для хранения элементов в памяти.
export function createItemsRepo() {
  const store = new Map();

  return {
    //Возвращает все элементы, отсортированные по имени (русская локаль).
    list() {
      return Array.from(store.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    },

    //Получает элемент по идентификатору.
    get(id) {
      const item = store.get(id);
      return item ? { ...item } : null; // возвращаем копию
    },

    //Создаёт новый элемент.
    create(name, price) {
      const trimmedName = String(name ?? '').trim();
      if (!trimmedName) {
        throw new Error('Имя элемента не может быть пустым');
      }
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || numPrice < 0) {
        throw new Error('Цена должна быть неотрицательным числом');
      }

      const id = randomUUID();
      const item = { id, name: trimmedName, price: numPrice };
      store.set(id, item);
      return { ...item };
    },

    //Обновляет существующий элемент.
    update(id, fields) {
      const existing = store.get(id);
      if (!existing) return null;

      const updated = { ...existing };

      if (fields.name !== undefined) {
        const newName = String(fields.name).trim();
        if (!newName) throw new Error('Имя не может быть пустым');
        updated.name = newName;
      }

      if (fields.price !== undefined) {
        const newPrice = Number(fields.price);
        if (!Number.isFinite(newPrice) || newPrice < 0) {
          throw new Error('Цена должна быть неотрицательным числом');
        }
        updated.price = newPrice;
      }

      store.set(id, updated);
      return { ...updated };
    },

    //Удаляет элемент по идентификатору.
    delete(id) {
      return store.delete(id);
    }
  };
}