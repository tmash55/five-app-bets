/** What each thing that can go wrong in an online game says to a child, kindly and in a few words. */

import type { RoomProblem } from './room';

export interface ProblemWords {
  title: string;
  text: string;
}

export function problemWords(p: RoomProblem): ProblemWords {
  switch (p) {
    case 'offline':
      return { title: "CAN'T CONNECT", text: 'The game room could not be reached. Check the Wi-Fi and try again.' };
    case 'no-room':
      return { title: 'NO GAME FOUND', text: 'No game has that code. Check the letters with your friend.' };
    case 'full':
      return { title: 'GAME IS FULL', text: 'That game already has two players.' };
    case 'mismatch':
      return { title: 'UPDATE BOTH DEVICES', text: 'Your devices have different versions of Bucket Squad. Update the game on both, then try again.' };
    case 'left':
      return { title: 'YOUR FRIEND LEFT', text: 'Your friend left the game. Nobody wins or loses anything.' };
    case 'gone':
      return { title: 'CONNECTION LOST', text: "We can't hear your friend's device any more, so this game stops here. Nobody loses anything." };
    case 'desync':
      return { title: 'OUT OF SYNC', text: 'The two games stopped matching, so this one ends here. Nobody loses anything. Try a new game!' };
    case 'taken':
      return { title: "CAN'T CONNECT", text: 'That room code is busy. Try again for a new one.' };
  }
}
