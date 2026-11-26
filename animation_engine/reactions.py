"""Animation-only reaction selector; not a physical simulator."""
from dataclasses import dataclass
from math import isfinite

@dataclass(frozen=True)
class Reaction:
    clip: str
    direction: str
    airborne: bool

def select_reaction(intensity: float, direction: str, state: str, mode: str = "realistic", blocked: bool = False, wall: bool = False) -> Reaction:
    if not isfinite(intensity) or not 0 <= intensity <= 1:
        raise ValueError("Intensity must be between 0 and 1")
    if direction not in ("forward", "backward", "left", "right"):
        raise ValueError("Invalid direction")
    if state not in ("standing", "walking", "running", "sitting", "jumping", "flying"):
        raise ValueError("Invalid state")
    if mode not in ("realistic", "donghua"):
        raise ValueError("Invalid mode")
    airborne = state in ("jumping", "flying")
    if blocked:
        clip = "block_reaction"
    elif intensity < .2:
        clip = "light_hit"
    elif airborne:
        clip = "aerial_spin" if mode == "donghua" and intensity >= .8 else "aerial_knockback" if mode == "donghua" else "airborne_balance_loss"
    elif intensity < .4:
        clip = "balance_recovery"
    elif intensity < .65:
        clip = direction + "_stagger"
    elif wall:
        clip = "wall_collision"
    elif mode == "donghua" and intensity >= .85:
        clip = "fantasy_knockback"
    else:
        clip = ("side" if direction in ("left", "right") else direction) + "_fall"
    return Reaction(clip, direction, airborne)

if __name__ == "__main__":
    assert select_reaction(.84, "backward", "jumping", "donghua").clip == "aerial_spin"
    assert select_reaction(.1, "left", "standing").clip == "light_hit"
    assert select_reaction(.5, "right", "walking").clip == "right_stagger"
    assert select_reaction(.75, "backward", "standing").clip == "backward_fall"
    assert select_reaction(.9, "forward", "running", blocked=True).clip == "block_reaction"
    print("Reaction selection smoke tests passed")
