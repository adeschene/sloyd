import { Viewport } from './viewport/Viewport';
import { useStore } from './store/store';

export default function App() {
  const addBoard = useStore((s) => s.addBoard);
  return (
    <div className="app">
      <button className="temp-add" onClick={addBoard}>+ Add Board</button>
      <Viewport />
    </div>
  );
}
