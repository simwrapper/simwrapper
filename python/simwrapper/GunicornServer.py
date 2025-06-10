from gunicorn.app.base import BaseApplication

class GunicornServer(BaseApplication):
    def __init__(self, app, **kwargs):
        self.application = app
        self.options = kwargs
        super().__init__()

    def load_config(self):
        for key, value in self.options.items():
            if key in self.cfg.settings and value is not None:
                self.cfg.set(key, value)

    def load(self):
        return self.application
