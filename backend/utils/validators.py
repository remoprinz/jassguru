from typing import Dict, Any

def validate_jass_data(data: Dict[str, Any]) -> bool:
    required_fields = ['mode', 'group_id', 'date', 'players']
    return all(field in data for field in required_fields) and isinstance(data['players'], list)

def validate_round_data(data: Dict[str, Any]) -> bool:
    required_fields = ['spiel_id', 'team1_score', 'team2_score', 'farbe']
    return all(field in data for field in required_fields)