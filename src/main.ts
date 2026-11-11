import './scss/main.scss';
import { Game } from './game/Game';
import { CharacterPicker } from './ui/CharacterPicker';

new Game(document.getElementById('stage') as HTMLElement);
new CharacterPicker();
