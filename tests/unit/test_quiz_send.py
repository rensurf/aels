import pytest
import requests
from unittest.mock import patch, MagicMock

from src.quiz.flow import _send


def _ok_response():
    mock = MagicMock()
    mock.raise_for_status.return_value = None
    return mock


def test_send_raises_on_http_error():
    mock = MagicMock()
    mock.raise_for_status.side_effect = requests.HTTPError("400 Bad Request")
    with patch("src.quiz.flow.requests.post", return_value=mock):
        with pytest.raises(requests.HTTPError):
            _send("123", "test")


def test_send_raises_on_timeout():
    with patch("src.quiz.flow.requests.post", side_effect=requests.exceptions.Timeout):
        with pytest.raises(requests.exceptions.Timeout):
            _send("123", "test")


def test_send_passes_timeout_to_requests():
    with patch("src.quiz.flow.requests.post", return_value=_ok_response()) as mock_post:
        _send("123", "hello")
        _, kwargs = mock_post.call_args
        assert "timeout" in kwargs, "timeout 引数が渡されていない"
        assert kwargs["timeout"] == 10
