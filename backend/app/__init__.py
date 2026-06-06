from flask import Flask
from flask_cors import CORS
import logging

from .routes import api
from .storage import init_database


def create_app() -> Flask:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    app = Flask(__name__)
    CORS(app)
    init_database()
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "QuantTrader AI"}

    return app
