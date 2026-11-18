"""Writes src/data/roster.json: the neighborhood league, its teams and every kid.

The cast is written here in a compact form and checked against the figure kit
(every hair style, face and accessory must exist) before the JSON is written.
The app and the card-art renderer both read the JSON.

    python tools/roster/build_roster.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "src" / "game" / "kit" / "kitData.json"
OUT = ROOT / "src" / "data" / "roster.json"

# --- colours ---------------------------------------------------------------

SKIN = {
    "porcelain": "#F8D9C0",
    "light": "#F3C9A8",
    "peach": "#F1C7A5",
    "sand": "#F0C8A0",
    "honey": "#E7B48A",
    "tan": "#D9A066",
    "amber": "#C68642",
    "copper": "#B5754A",
    "chestnut": "#A86E44",
    "brown": "#8D5A3B",
    "umber": "#6F4529",
    "cocoa": "#5C3A26",
    "espresso": "#4A2E1F",
}

HAIR = {
    "black": "#1C1310",
    "jet": "#19100C",
    "darkbrown": "#2A1B12",
    "brown": "#4A2F1D",
    "chestnut": "#3B2616",
    "lightbrown": "#7A5230",
    "sandy": "#B8823C",
    "blonde": "#E3B453",
    "gold": "#D9A441",
    "lightblonde": "#F0D27A",
    "white": "#F4F0E0",
    "ginger": "#C4532D",
    "auburn": "#8C3B22",
    "gray": "#C9C9CF",
    "pink": "#FF7AB8",
    "blue": "#3FA9F5",
    "purple": "#9B6BFF",
    "yellow": "#FFD23F",
    "snow": "#E8E8EC",
}

WHITE = "#FFFFFF"
SOLE = "#F4F1EA"


def kit(jersey, trim, number, shorts, shorts_trim, shoe, shoe_accent, sock, band):
    return {
        "jersey": jersey,
        "trim": trim,
        "number": number,
        "shorts": shorts,
        "shortsTrim": shorts_trim,
        "shoe": shoe,
        "shoeAccent": shoe_accent,
        "sole": SOLE,
        "sock": sock,
        "band": band,
    }


TEAMS = [
    {
        "id": "comets",
        "name": "Comets",
        "place": "Pinecone Park",
        "short": "COM",
        "color": "#2F6BDE",
        "color2": "#FFD23F",
        "kit": kit("#2F6BDE", "#FFD23F", WHITE, "#2F6BDE", "#FFD23F", WHITE, "#2F6BDE", WHITE, "#FFD23F"),
        "court": "park",
        "league": "neighborhood",
        "motto": "First ones at the park, last ones to leave.",
    },
    {
        "id": "stompers",
        "name": "Stompers",
        "place": "Maple Street",
        "short": "STM",
        "color": "#7A4CE0",
        "color2": "#FFD23F",
        "kit": kit("#7A4CE0", "#FFD23F", "#FFD23F", "#3A2A7A", "#FFD23F", "#2B2440", "#FFD23F", WHITE, "#FFD23F"),
        "court": "street",
        "league": "neighborhood",
        "motto": "You hear them before you see them.",
    },
    {
        "id": "waves",
        "name": "Waves",
        "place": "Sunset Beach",
        "short": "WAV",
        "color": "#19B7B2",
        "color2": "#FF7A59",
        "kit": kit("#19B7B2", WHITE, WHITE, "#FF7A59", WHITE, WHITE, "#FF7A59", WHITE, "#FF7A59"),
        "court": "beach",
        "league": "neighborhood",
        "motto": "Sand in their shoes, nothing but net.",
    },
    {
        "id": "skyhawks",
        "name": "Skyhawks",
        "place": "Downtown",
        "short": "SKY",
        "color": "#FF8A3D",
        "color2": "#2A2D45",
        "kit": kit("#2A2D45", "#FF8A3D", "#FF8A3D", "#2A2D45", "#FF8A3D", "#FF8A3D", WHITE, WHITE, "#FF8A3D"),
        "court": "rooftop",
        "league": "neighborhood",
        "motto": "Twelve floors up and still climbing.",
    },
    {
        "id": "yetis",
        "name": "Yetis",
        "place": "Snowy Peak",
        "short": "YET",
        "color": "#58C4FF",
        "color2": "#1B56D6",
        "kit": kit("#F2F7FF", "#58C4FF", "#1B56D6", "#58C4FF", WHITE, "#1B56D6", WHITE, WHITE, "#58C4FF"),
        "court": "snow",
        "league": "neighborhood",
        "motto": "Cold hands, hot shooting.",
    },
    {
        "id": "coyotes",
        "name": "Coyotes",
        "place": "Cactus Canyon",
        "short": "COY",
        "color": "#E0632D",
        "color2": "#F6E3B4",
        "kit": kit("#E0632D", "#F6E3B4", "#F6E3B4", "#5B3420", "#F6E3B4", "#F6E3B4", "#E0632D", "#F6E3B4", "#F6E3B4"),
        "court": "canyon",
        "league": "neighborhood",
        "motto": "They howl after every bucket.",
    },
    {
        "id": "throwbacks",
        "name": "Throwbacks",
        "place": "Old School",
        "short": "OLD",
        "color": "#1FA872",
        "color2": "#FFF3D6",
        "kit": kit("#1FA872", "#FFF3D6", "#FFF3D6", "#1FA872", "#FFF3D6", "#FFF3D6", "#1FA872", "#FFF3D6", "#D9502E"),
        "court": "street",
        "league": "neighborhood",
        "motto": "Short shorts, tall socks, fundamentals.",
    },
    {
        "id": "legends",
        "name": "Legends",
        "place": "Midnight",
        "short": "LEG",
        "color": "#FFB800",
        "color2": "#16182B",
        "kit": kit("#16182B", "#FFB800", "#FFB800", "#16182B", "#FFB800", "#FFB800", "#16182B", "#16182B", "#FFB800"),
        "court": "rooftop",
        "league": "neighborhood",
        "motto": "They only play when the city is asleep.",
    },
]

# --- the cast --------------------------------------------------------------
# P(id, name, nickname, team, number, rarity, role,
#   (speed, shot, dunk, handle, steal, block), look, blurb, era="now")

CAST = []


def P(pid, name, nick, team, number, rarity, role, ratings, look, blurb, era="now"):
    CAST.append(
        {
            "id": pid,
            "name": name,
            "nickname": nick,
            "team": team,
            "number": number,
            "rarity": rarity,
            "era": era,
            "role": role,
            "ratings": dict(zip(("speed", "shot", "dunk", "handle", "steal", "block"), ratings)),
            "look": look,
            "blurb": blurb,
        }
    )


def L(skin, style, hair, eyes="oval", brows="calm", mouth="smile", nose=None, facial=None, acc=(), **extra):
    look = {"skin": SKIN[skin], "hair": {"style": style, "color": HAIR[hair]}, "eyes": eyes, "brows": brows, "mouth": mouth}
    if nose:
        look["nose"] = nose
    if facial:
        look["facial"] = facial
    if acc:
        look["accessories"] = list(acc)
    look.update(extra)
    return look


RETRO = {"shortShorts": True, "highSocks": True}

# Pinecone Park Comets
P("dash-bennett", "Dash Bennett", "Zoom", "comets", 3, "rare", "Speedster", (92, 68, 72, 84, 76, 48),
  L("brown", "hightop", "black", brows="fierce", mouth="smirk", acc=("wristbandR",), build={"height": 0.97},
    kit={"shoe": "#FFD23F", "shoeAccent": "#2F6BDE"}),
  "So fast his shadow needs a head start.")
P("pippa-quinn", "Pippa Quinn", "Pip", "comets", 12, "common", "Sharpshooter", (66, 84, 44, 68, 58, 42),
  L("light", "pigtails", "ginger", eyes="round", brows="raised", mouth="grin", nose="small", acc=("freckles", "lashes"),
    build={"height": 0.93}),
  "Practices swishes on her garage hoop until the streetlights come on.")
P("gus-moretti", "Gus Moretti", "Big Gus", "comets", 44, "common", "Big", (50, 56, 80, 50, 48, 84),
  L("peach", "curly", "gold", eyes="wide", brows="thick", mouth="bigsmile", nose="wide", acc=("sweatband",),
    build={"height": 1.08, "bulk": 1.12}),
  "Blocks your shot, then shares his orange slices.")
P("nia-brooks", "Nia Brooks", "Hops", "comets", 21, "rare", "High Flyer", (80, 64, 92, 70, 66, 78),
  L("cocoa", "puffs", "jet", eyes="tall", brows="raised", mouth="grin", acc=("lashes", "wristbandL"), highSocks=True),
  "Jumped clean over the monkey bars once. Okay, twice.")
P("teo-ramirez", "Teo Ramirez", "Captain", "comets", 8, "epic", "All-Around", (82, 84, 80, 84, 78, 70),
  L("amber", "short", "darkbrown", mouth="bigsmile", acc=("capBack",), hatColor="#E5483B"),
  "Picks the teams, keeps the peace and hits the game winner.")
P("wren-kowalski", "Wren Kowalski", "Hawk Eye", "comets", 5, "common", "Lockdown", (72, 60, 46, 62, 86, 70),
  L("porcelain", "bob", "brown", eyes="round", acc=("glasses", "lashes"), frameColor="#E5483B", build={"height": 0.95}),
  "Reads every pass like it is her favorite book.")

# Maple Street Stompers
P("jax-monroe", "Jax Monroe", "Boom", "stompers", 1, "epic", "High Flyer", (84, 70, 96, 76, 68, 82),
  L("chestnut", "mohawk", "blue", eyes="wide", brows="fierce", mouth="tooth", acc=("bandaid", "wristbandL", "wristbandR")),
  "Every dunk gets a sound effect. He does them himself.")
P("lulu-park", "Lulu Park", "Lightning Lu", "stompers", 7, "rare", "Speedster", (94, 72, 50, 86, 80, 40),
  L("sand", "highpony", "black", eyes="tall", brows="raised", mouth="grin", nose="small", acc=("lashes", "headband"),
    build={"height": 0.92}),
  "Blink and she already has the ball. And your snack.")
P("otis-washington", "Otis Washington", "The Wall", "stompers", 50, "common", "Big", (48, 52, 82, 48, 50, 90),
  L("umber", "flattop", "black", brows="thick", nose="wide", acc=("kneepadL", "kneepadR"), build={"height": 1.1, "bulk": 1.15}),
  "Nothing gets past him. Not even the ice cream truck.")
P("maya-okafor", "Maya Okafor", "Splash", "stompers", 30, "rare", "Sharpshooter", (74, 94, 56, 76, 62, 50),
  L("umber", "braids", "black", eyes="tall", mouth="smirk", acc=("lashes", "sleeveR"), sleeveColor="#FFD23F"),
  "Calls \"splash\" before the ball leaves her hands.")
P("finn-omalley", "Finn O'Malley", "Gizmo", "stompers", 13, "common", "Playmaker", (70, 66, 42, 86, 66, 40),
  L("porcelain", "spiky", "ginger", eyes="wide", brows="raised", mouth="tooth", acc=("goggles", "freckles"),
    build={"height": 0.94}),
  "Invented eleven new passes. Four of them work.")
P("bea-castillo", "Bea Castillo", "Bumble", "stompers", 22, "common", "Lockdown", (76, 58, 48, 64, 84, 66),
  L("tan", "bun", "darkbrown", eyes="round", brows="fierce", acc=("bow", "lashes")),
  "Buzzes around the ball handler until they give up.")

# Sunset Beach Waves
P("kai-nakoa", "Kai Nakoa", "Big Wave", "waves", 11, "epic", "All-Around", (84, 80, 88, 80, 74, 76),
  L("amber", "long", "chestnut", mouth="bigsmile", acc=("headband",), build={"height": 1.04}),
  "Surfs at sunrise, dunks by lunch.")
P("sunny-delgado", "Sunny Delgado", "Sunshine", "waves", 2, "rare", "Sharpshooter", (76, 92, 52, 78, 64, 48),
  L("tan", "ponytail", "blonde", eyes="round", brows="raised", mouth="bigsmile", acc=("lashes", "freckles")),
  "Her jump shot is as warm as her name.")
P("moose-larsen", "Moose Larsen", "Moose", "waves", 55, "common", "Big", (46, 58, 78, 46, 46, 88),
  L("porcelain", "bowl", "lightblonde", eyes="wide", mouth="open", nose="wide", acc=("bucket",), hatColor="#FF7A59",
    build={"height": 1.12, "bulk": 1.14}),
  "Wears sunscreen like frosting. Swats shots like flies.")
P("zuri-thompson", "Zuri Thompson", "Flip", "waves", 9, "rare", "High Flyer", (86, 62, 90, 74, 70, 72),
  L("espresso", "frohawk", "jet", eyes="tall", brows="fierce", mouth="grin", acc=("lashes", "wristbandR"), highSocks=True),
  "A gymnastics champ who found out the rim is just a higher beam.")
P("rio-santos", "Rio Santos", "Slick", "waves", 14, "common", "Playmaker", (74, 68, 58, 84, 62, 44),
  L("amber", "slick", "black", brows="raised", mouth="smirk"),
  "Never met a behind-the-back pass he did not like.")
P("coco-fairbanks", "Coco Fairbanks", "Coconut", "waves", 4, "common", "Speedster", (88, 60, 44, 76, 72, 40),
  L("chestnut", "curly", "brown", eyes="round", brows="raised", mouth="tooth", acc=("bandana", "lashes"),
    build={"height": 0.9}),
  "The smallest Wave makes the biggest splash.")

# Downtown Skyhawks
P("ace-carter", "Ace Carter", "Airmail", "skyhawks", 17, "epic", "High Flyer", (88, 76, 97, 80, 70, 74),
  L("umber", "fade", "black", brows="fierce", mouth="smirk", acc=("headband", "sleeveL", "wristbandR"),
    kit={"shoe": "#FFFFFF", "shoeAccent": "#FF8A3D"}),
  "Delivers dunks from the top floor.")
P("roxy-vance", "Roxy Vance", "Riot", "skyhawks", 6, "rare", "Lockdown", (82, 64, 66, 72, 92, 76),
  L("light", "bob", "pink", eyes="wide", brows="fierce", mouth="tooth", acc=("bandaid", "lashes", "kneepadL")),
  "If you are dribbling near her, it is already her ball.")
P("arjun-mehta", "Arjun Mehta", "Chess Club", "skyhawks", 10, "rare", "Playmaker", (76, 80, 48, 94, 70, 44),
  L("chestnut", "sidepart", "black", eyes="round", acc=("glasses",)),
  "Thinks three passes ahead. Sometimes four.")
P("tank-novak", "Tank Novak", "Tank", "skyhawks", 52, "common", "Big", (44, 50, 84, 44, 52, 86),
  L("honey", "buzz", "brown", brows="thick", mouth="flat", nose="wide", acc=("sweatband",), build={"height": 1.1, "bulk": 1.2}),
  "Takes the stairs to the roof to warm up. All twelve floors.")
P("mimi-tran", "Mimi Tran", "Mini", "skyhawks", 0, "common", "Speedster", (90, 70, 40, 78, 74, 40),
  L("sand", "pigtails", "black", eyes="tall", brows="raised", mouth="open", nose="small", acc=("bow", "lashes"),
    build={"height": 0.88}),
  "Too quick to guard, too small to see coming.")
P("ziggy-flores", "Ziggy Flores", "Zigzag", "skyhawks", 15, "common", "Sharpshooter", (68, 86, 54, 70, 56, 46),
  L("tan", "curly", "darkbrown", mouth="smirk", acc=("beanie",), hatColor="#FF8A3D"),
  "Never takes the beanie off. Never misses from the corner.")

# Snowy Peak Yetis
P("bjorn-iversen", "Bjorn Iversen", "Avalanche", "yetis", 45, "epic", "Big", (68, 74, 94, 68, 66, 98),
  L("porcelain", "spiky", "white", brows="thick", mouth="grin", nose="wide", browColor="#C9B98A",
    build={"height": 1.14, "bulk": 1.16}),
  "When he rolls downhill, clear the lane.")
P("suki-aoki", "Suki Aoki", "Snowflake", "yetis", 18, "rare", "Sharpshooter", (78, 93, 50, 80, 66, 46),
  L("porcelain", "long", "black", eyes="tall", nose="small", acc=("beanie", "lashes"), hatColor="#58C4FF"),
  "No two of her shots are alike. All of them go in.")
P("tuck-whitlock", "Tuck Whitlock", "Mittens", "yetis", 31, "common", "Lockdown", (66, 56, 56, 58, 82, 78),
  L("light", "bowl", "ginger", eyes="round", brows="raised", mouth="tooth", acc=("freckles", "sweatband")),
  "Plays in mittens all winter. Still gets the steal.")
P("ana-petrova", "Ana Petrova", "Ice", "yetis", 19, "rare", "All-Around", (80, 82, 70, 80, 76, 70),
  L("porcelain", "braids", "lightblonde", mouth="flat", nose="small", acc=("lashes",)),
  "Never smiles before the buzzer. Always smiles after.")
P("nuka-olsen", "Nuka Olsen", "Sled Dog", "yetis", 27, "common", "Speedster", (88, 58, 52, 72, 66, 44),
  L("tan", "short", "black", brows="raised", mouth="bigsmile", acc=("headband",)),
  "Outruns the snowplow on the way to school.")
P("pearl-jackson", "Pearl Jackson", "Frosty", "yetis", 33, "common", "High Flyer", (68, 52, 86, 56, 54, 70),
  L("cocoa", "afro", "jet", eyes="round", brows="raised", mouth="bigsmile", acc=("headband", "lashes"), highSocks=True),
  "Jumps so high she comes down with snow in her hair.")

# Cactus Canyon Coyotes
P("sage-yazzie", "Sage Yazzie", "Compass", "coyotes", 20, "epic", "Playmaker", (84, 82, 62, 97, 84, 58),
  L("copper", "braids", "black", eyes="tall", acc=("headband", "lashes")),
  "Always knows where everyone is. Even you.")
P("colt-mcgraw", "Colt McGraw", "Dusty", "coyotes", 35, "rare", "Sharpshooter", (72, 95, 60, 72, 60, 54),
  L("peach", "short", "sandy", mouth="smirk", acc=("capFwd", "freckles"), hatColor="#5B3420"),
  "Quick draw, quicker release.")
P("rosa-jimenez", "Rosa Jimenez", "La Flecha", "coyotes", 16, "rare", "Speedster", (95, 70, 58, 84, 78, 44),
  L("amber", "highpony", "darkbrown", eyes="round", brows="fierce", mouth="grin", acc=("lashes", "wristbandL", "wristbandR")),
  "La Flecha means The Arrow. She only flies one way: straight to the hoop.")
P("hank-dooley", "Hank Dooley", "Tumbleweed", "coyotes", 40, "common", "Big", (52, 54, 80, 52, 50, 86),
  L("honey", "bigafro", "lightbrown", eyes="wide", brows="thick", mouth="bigsmile", nose="wide",
    build={"height": 1.08, "bulk": 1.1}),
  "His hair has its own rebounding stats.")
P("ike-onyango", "Ike Onyango", "Spike", "coyotes", 29, "common", "Lockdown", (70, 52, 62, 58, 80, 84),
  L("espresso", "toplocs", "jet", brows="fierce", mouth="flat", acc=("sleeveR", "wristbandL")),
  "Prickly on defense, just like a cactus.")
P("dot-finnegan", "Dot Finnegan", "Rattler", "coyotes", 28, "common", "High Flyer", (74, 54, 84, 60, 60, 56),
  L("light", "bob", "ginger", eyes="wide", brows="fierce", mouth="grin", acc=("bandana", "freckles", "lashes")),
  "You hear the rim rattle before you see her.")

# Old School Throwbacks
P("earl-dupree", "Earl Dupree", "Sky", "throwbacks", 41, "legend", "High Flyer", (88, 84, 99, 86, 78, 86),
  L("umber", "bigafro", "jet", facial="mustache", acc=("headband", "wristbandL", "wristbandR"), build={"height": 1.1}, **RETRO),
  "They say he took off from the foul line in 1976 and landed last week.", era="classic")
P("bud-higgins", "Bud Higgins", "Hook", "throwbacks", 54, "epic", "Big", (64, 80, 86, 66, 62, 96),
  L("peach", "flattop", "lightbrown", brows="thick", mouth="flat", facial="mustache", acc=("glasses", "kneepadL", "kneepadR"),
    build={"height": 1.16, "bulk": 1.1}, **RETRO),
  "Nobody has blocked his hook shot since TV was black and white.", era="classic")
P("ginny-malone", "Ginny Malone", "Set Shot", "throwbacks", 14, "epic", "Sharpshooter", (80, 98, 60, 86, 72, 56),
  L("light", "sidepart", "auburn", eyes="round", acc=("headband", "lashes"), **RETRO),
  "Two feet on the floor, nothing but net, since way back when.", era="classic")
P("leroy-banks", "Leroy Banks", "Smooth", "throwbacks", 25, "epic", "Playmaker", (84, 84, 78, 96, 82, 60),
  L("brown", "minifro", "jet", brows="raised", mouth="smirk", facial="goatee", acc=("sweatband", "wristbandR"), **RETRO),
  "So smooth the ball forgets it is being dribbled.", era="classic")
P("winnie-chow", "Winnie Chow", "Whirlwind", "throwbacks", 7, "rare", "Speedster", (93, 74, 54, 84, 82, 46),
  L("sand", "bun", "black", eyes="tall", brows="raised", mouth="grin", acc=("sweatband", "lashes"), build={"height": 0.95}, **RETRO),
  "Ran the fast break before it had a name.", era="classic")
P("walt-pickett", "Walt Pickett", "Gramps", "throwbacks", 1, "rare", "All-Around", (66, 88, 58, 84, 76, 66),
  L("peach", "horseshoe", "gray", brows="thick", mouth="bigsmile", facial="bigbeard", acc=("glasses",), browColor="#9A9AA2", **RETRO),
  "Walked to the court uphill both ways. Still has the best bank shot in town.", era="classic")

# Midnight Legends
P("stella-starr", "Stella Starr", "Comet", "legends", 99, "legend", "Sharpshooter", (88, 99, 82, 90, 80, 66),
  L("honey", "long", "purple", eyes="tall", brows="fierce", mouth="smirk", acc=("lashes", "headband", "sleeveR"), sleeveColor="#FFB800"),
  "Shoots from so far away the ball needs a map.")
P("titan-okoye", "Titan Okoye", "Tiny", "legends", 88, "legend", "Big", (80, 84, 99, 78, 76, 99),
  L("espresso", "bald", "jet", brows="thick", mouth="flat", nose="wide", facial="bigbeard", acc=("headband",),
    build={"height": 1.2, "bulk": 1.22}),
  "They call him Tiny. Nobody knows why. Nobody asks.")
P("zeke-zamora", "Zeke Zamora", "Volt", "legends", 77, "legend", "Speedster", (99, 86, 86, 96, 90, 56),
  L("tan", "spiky", "yellow", eyes="wide", brows="fierce", mouth="tooth", acc=("wristbandL", "wristbandR", "legSleeveL"),
    sleeveColor="#FFB800", browColor="#3B2616"),
  "Plugs his sneakers in at night.")
P("imani-royce", "Imani Royce", "Queen", "legends", 10, "legend", "All-Around", (90, 92, 90, 92, 88, 84),
  L("umber", "topknot", "jet", eyes="tall", brows="fierce", mouth="smirk", acc=("headband", "lashes", "wristbandL", "sleeveL"),
    sleeveColor="#FFB800"),
  "The court is her castle. Everyone else is just visiting.")
P("shay-knox", "Shay Knox", "Shadow", "legends", 13, "epic", "Lockdown", (88, 74, 78, 78, 98, 90),
  L("chestnut", "cornrows", "jet", brows="fierce", mouth="flat", acc=("lashes", "sleeveL", "sleeveR"), sleeveColor="#16182B"),
  "You never see the steal. You just notice the ball is gone.")
P("jett-okoro", "Jett Okoro", "Jetpack", "legends", 44, "epic", "High Flyer", (90, 72, 98, 80, 72, 84),
  L("cocoa", "hightop", "snow", brows="raised", mouth="bigsmile", acc=("wristbandR", "kneepadL"), browColor="#19100C"),
  "Hang time so long he packs a lunch.")


# --- checks ----------------------------------------------------------------

BANDS = {"common": (56, 70), "rare": (68, 79), "epic": (75, 87), "legend": (86, 99)}
BODY_ACCESSORIES = {"wristbandL", "wristbandR", "sleeveL", "sleeveR", "kneepadL", "kneepadR", "legSleeveL", "legSleeveR"}


def overall(r):
    v = r["speed"] * 0.2 + r["shot"] * 0.22 + r["dunk"] * 0.2 + r["handle"] * 0.16 + r["steal"] * 0.11 + r["block"] * 0.11
    return int(v + 0.5)


def check():
    styles = json.loads(KIT.read_text())["styles"]
    errors = []
    team_ids = {t["id"] for t in TEAMS}
    seen = set()
    numbers = set()
    for p in CAST:
        tag = p["id"]
        if tag in seen:
            errors.append(f"{tag}: duplicate id")
        seen.add(tag)
        if p["team"] not in team_ids:
            errors.append(f"{tag}: unknown team {p['team']}")
        key = (p["team"], p["number"])
        if key in numbers:
            errors.append(f"{tag}: number {p['number']} is taken on {p['team']}")
        numbers.add(key)
        look = p["look"]
        if look["hair"]["style"] not in styles["hair"] and look["hair"]["style"] != "bald":
            errors.append(f"{tag}: hair {look['hair']['style']}")
        for field, pool in (("eyes", "eyes"), ("brows", "brows"), ("mouth", "mouths"), ("nose", "noses"), ("facial", "facial")):
            if field in look and look[field] not in styles[pool]:
                errors.append(f"{tag}: {field} {look[field]}")
        for a in look.get("accessories", []):
            if a not in styles["accessories"] and a not in BODY_ACCESSORIES:
                errors.append(f"{tag}: accessory {a}")
        lo, hi = BANDS[p["rarity"]]
        ovr = overall(p["ratings"])
        if not lo <= ovr <= hi:
            errors.append(f"{tag}: overall {ovr} is outside {p['rarity']} {lo}-{hi}")
        for k, v in p["ratings"].items():
            if not 40 <= v <= 99:
                errors.append(f"{tag}: {k} {v}")
    for t in TEAMS:
        n = sum(1 for p in CAST if p["team"] == t["id"])
        if n < 3:
            errors.append(f"{t['id']}: only {n} players")
    return errors


def main():
    errors = check()
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    data = {"id": "neighborhood", "name": "Neighborhood", "teams": TEAMS, "players": CAST}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    by = {}
    for p in CAST:
        by[p["rarity"]] = by.get(p["rarity"], 0) + 1
    print(f"wrote {OUT.relative_to(ROOT)}: {len(TEAMS)} teams, {len(CAST)} players, {by}")
    for p in sorted(CAST, key=lambda q: -overall(q["ratings"])):
        print(f"  {overall(p['ratings']):3d} {p['rarity']:7s} {p['name']:18s} {p['role']}")


if __name__ == "__main__":
    main()
