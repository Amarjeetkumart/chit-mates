from enum import Enum


class CardType(str, Enum):
    HEART = "heart"
    DIAMOND = "diamond"
    TREE = "tree"
    BLACK_JACK = "black_jack"


CARD_POINTS: dict[CardType, int] = {
    CardType.HEART: 250,
    CardType.DIAMOND: 200,
    CardType.TREE: 125,
    CardType.BLACK_JACK: 75,
}


class PlayerPosition(int, Enum):
    ONE = 1
    TWO = 2
    THREE = 3
    FOUR = 4


class RoomStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"


class GameStatus(str, Enum):
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class RoundStatus(str, Enum):
    WAITING = "waiting"
    RUNNING = "running"
    FINISHED = "finished"
