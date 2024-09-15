
from your_project import create_app


def test_register():
    app = create_app()
    client = app.test_client()

    # Create a new user
    response = client.post('/register', json={
        'nickname': 'testuser',
        'password': 'testpassword',
        'email': 'testuser@example.com'
    })

    assert response.status_code == 200  # assuming 200 is the success code

    # Fetch the player
    player = Player.query.filter_by(nickname='testuser').first()
    player_profile = PlayerProfile.query.filter_by(player_id=player.id).first()

    assert player is not None
    assert player_profile is not None

    # Assert the details
    assert player.nickname == 'testuser'
    assert player_profile.email == 'testuser@example.com'
    assert player_profile.check_password('testpassword')
