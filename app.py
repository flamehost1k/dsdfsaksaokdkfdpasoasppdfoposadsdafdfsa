import sys
import json
import requests
from PyQt6.QtWidgets import *
from PyQt6.QtCore import *
from PyQt6.QtGui import *

# ===================== API КЛЮЧ =====================
API_TOKEN = "8624670051:qcmz9ONI"
API_URL = "https://leakosintapi.com/"

# ===================== ОСНОВНОЕ ОКНО =====================
class LeakOSINTApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LeakOSINT – Поиск")
        self.setFixedSize(1300, 850)
        
        # Стилизация окна (закругление, тень, фон)
        self.setStyleSheet("""
            QMainWindow {
                background: #0e0e12;
                border-radius: 60px;
                border: 1px solid rgba(255,255,255,0.04);
            }
            QWidget {
                background: transparent;
                font-family: "Kanit", "Segoe UI", sans-serif;
                font-weight: 300;
                color: #fff;
            }
            QScrollBar:vertical {
                background: transparent;
                width: 6px;
                border-radius: 20px;
            }
            QScrollBar::handle:vertical {
                background: #a3e635;
                border-radius: 20px;
                min-height: 30px;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
            }
        """)
        
        # Центральный виджет
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(0)
        
        # ---------- НАВИГАЦИЯ ----------
        nav_widget = QWidget()
        nav_layout = QHBoxLayout(nav_widget)
        nav_layout.setContentsMargins(0, 0, 0, 14)
        nav_layout.setSpacing(12)
        
        # Логотип
        logo_btn = QPushButton("⚡")
        logo_btn.setFixedSize(44, 44)
        logo_btn.setStyleSheet("""
            QPushButton {
                background: #a3e635;
                border-radius: 22px;
                font-size: 22px;
                color: #0e0e12;
            }
            QPushButton:hover { background: #b8f054; }
        """)
        logo_btn.setEnabled(False)
        nav_layout.addWidget(logo_btn)
        
        # Навигационные ссылки
        nav_links_widget = QWidget()
        nav_links_layout = QHBoxLayout(nav_links_widget)
        nav_links_layout.setContentsMargins(12, 6, 12, 6)
        nav_links_layout.setSpacing(8)
        nav_links_widget.setStyleSheet("""
            QWidget {
                background: #171717;
                border-radius: 50px;
            }
        """)
        
        self.search_tab_btn = QPushButton("Поиск")
        self.search_tab_btn.setCheckable(True)
        self.search_tab_btn.setChecked(True)
        self.history_tab_btn = QPushButton("История")
        self.history_tab_btn.setCheckable(True)
        self.docs_tab_btn = QPushButton("Документация")
        self.docs_tab_btn.setCheckable(True)
        
        tab_style = """
            QPushButton {
                color: #fff;
                font-size: 14px;
                padding: 4px 6px;
                background: transparent;
                border: none;
            }
            QPushButton:hover { color: #a3e635; }
            QPushButton:checked { color: #a3e635; }
        """
        for btn in [self.search_tab_btn, self.history_tab_btn, self.docs_tab_btn]:
            btn.setStyleSheet(tab_style)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
        
        # Разделитель
        sep_label = QLabel("|")
        sep_label.setStyleSheet("color: #666; font-size: 13px;")
        
        # Колокольчик
        bell_btn = QPushButton("🔔")
        bell_btn.setStyleSheet("""
            QPushButton {
                color: #a3e635;
                background: transparent;
                border: none;
                font-size: 14px;
            }
        """)
        bell_btn.setEnabled(False)
        
        nav_links_layout.addWidget(self.search_tab_btn)
        nav_links_layout.addWidget(self.create_separator())
        nav_links_layout.addWidget(self.history_tab_btn)
        nav_links_layout.addWidget(self.create_separator())
        nav_links_layout.addWidget(self.docs_tab_btn)
        nav_links_layout.addWidget(sep_label)
        nav_links_layout.addWidget(bell_btn)
        
        nav_layout.addWidget(nav_links_widget)
        
        # Логин / аккаунт
        login_widget = QWidget()
        login_layout = QHBoxLayout(login_widget)
        login_layout.setContentsMargins(14, 4, 4, 4)
        login_layout.setSpacing(12)
        login_widget.setStyleSheet("""
            QWidget {
                background: #171717;
                border-radius: 50px;
            }
        """)
        
        login_label = QLabel("Аккаунт")
        login_label.setStyleSheet("font-size: 13px; color: #fff;")
        login_label.setCursor(Qt.CursorShape.PointingHandCursor)
        
        avatar_label = QLabel()
        avatar_label.setFixedSize(32, 32)
        avatar_label.setStyleSheet("""
            QLabel {
                background: #2a2a2a;
                border-radius: 16px;
            }
        """)
        
        login_layout.addWidget(login_label)
        login_layout.addWidget(avatar_label)
        
        nav_layout.addStretch()
        nav_layout.addWidget(login_widget)
        
        main_layout.addWidget(nav_widget)
        
        # ---------- ПОИСК ----------
        self.search_section = QWidget()
        search_layout = QVBoxLayout(self.search_section)
        search_layout.setContentsMargins(0, 20, 0, 10)
        search_layout.setSpacing(12)
        
        # Заголовок
        title_label = QLabel("leak<span style='color:#a3e635; font-weight:500;'>osint</span>")
        title_label.setStyleSheet("""
            QLabel {
                font-size: 72px;
                font-weight: 400;
                color: #ccc;
                letter-spacing: -0.02em;
            }
        """)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        search_layout.addWidget(title_label)
        
        # Область с изображением и поиском
        prompt_widget = QWidget()
        prompt_widget.setStyleSheet("""
            QWidget {
                background: transparent;
                border-radius: 40px;
            }
        """)
        prompt_layout = QVBoxLayout(prompt_widget)
        prompt_layout.setContentsMargins(0, 0, 0, 0)
        prompt_layout.setSpacing(0)
        
        # Картинка (фон)
        img_label = QLabel()
        img_label.setFixedHeight(300)
        img_label.setStyleSheet("""
            QLabel {
                background: #1a1a1e;
                border-radius: 40px;
                border: 1px solid rgba(255,255,255,0.03);
            }
        """)
        # Текст вместо картинки (для экономии)
        img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        img_label.setText("🔍 LeakOSINT")
        img_label.setStyleSheet("""
            QLabel {
                background: #1a1a1e;
                border-radius: 40px;
                font-size: 32px;
                color: #444;
                border: 1px solid rgba(255,255,255,0.03);
            }
        """)
        prompt_layout.addWidget(img_label)
        
        # Строка поиска с блюром
        search_widget = QWidget()
        search_widget.setStyleSheet("""
            QWidget {
                background: rgba(20, 20, 24, 0.55);
                border-radius: 80px;
                border: 1px solid rgba(255,255,255,0.12);
            }
            QWidget:focus-within {
                border-color: #a3e635;
                background: rgba(20, 20, 24, 0.8);
            }
        """)
        search_widget_layout = QHBoxLayout(search_widget)
        search_widget_layout.setContentsMargins(24, 6, 6, 6)
        search_widget_layout.setSpacing(8)
        
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("email, логин, телефон или ФИО...")
        self.search_input.setText("example@gmail.com")
        self.search_input.setStyleSheet("""
            QLineEdit {
                background: transparent;
                border: none;
                color: #fff;
                font-size: 18px;
                padding: 14px 0;
            }
        """)
        search_widget_layout.addWidget(self.search_input)
        
        self.search_btn = QPushButton("🔍 Найти")
        self.search_btn.setStyleSheet("""
            QPushButton {
                background: #a3e635;
                border: none;
                border-radius: 60px;
                color: #0e0e12;
                font-size: 18px;
                font-weight: 400;
                padding: 12px 28px;
            }
            QPushButton:hover {
                background: #b8f054;
            }
        """)
        self.search_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        search_widget_layout.addWidget(self.search_btn)
        
        # Позиционирование поверх картинки (контейнер)
        self.search_container = QWidget(prompt_widget)
        self.search_container.setStyleSheet("background: transparent;")
        self.search_container.setGeometry(0, 90, prompt_widget.width(), 70)
        self.search_container_layout = QVBoxLayout(self.search_container)
        self.search_container_layout.setContentsMargins(50, 0, 50, 0)
        self.search_container_layout.addWidget(search_widget)
        
        # Вкладки фильтра
        tabs_widget = QWidget()
        tabs_widget.setStyleSheet("""
            QWidget {
                background: rgba(10, 10, 12, 0.55);
                border-radius: 60px;
                border: 1px solid rgba(255,255,255,0.04);
            }
        """)
        tabs_layout = QHBoxLayout(tabs_widget)
        tabs_layout.setContentsMargins(14, 8, 14, 8)
        tabs_layout.setSpacing(6)
        tabs_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.filter_btns = []
        filters = [
            ("Все базы", "all"),
            ("Email", "email"),
            ("Логины", "login"),
            ("Телефоны", "phone"),
            ("ФИО", "name")
        ]
        
        filter_style = """
            QPushButton {
                color: #fff;
                background: #1f1f23;
                padding: 6px 18px;
                min-width: 80px;
                border-radius: 50px;
                border: 1px solid transparent;
                font-size: 14px;
            }
            QPushButton:hover, QPushButton:checked {
                color: #0e0e12;
                background: #a3e635;
                border-color: #a3e635;
            }
        """
        
        for text, f_id in filters:
            btn = QPushButton(text)
            btn.setCheckable(True)
            if text == "Все базы":
                btn.setChecked(True)
            btn.setStyleSheet(filter_style)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setProperty("filter_id", f_id)
            self.filter_btns.append(btn)
            tabs_layout.addWidget(btn)
        
        # Добавляем табы в контейнер
        self.tabs_container = QWidget(prompt_widget)
        self.tabs_container.setStyleSheet("background: transparent;")
        self.tabs_container.setGeometry(0, 260, prompt_widget.width(), 50)
        self.tabs_container_layout = QVBoxLayout(self.tabs_container)
        self.tabs_container_layout.setContentsMargins(0, 0, 0, 0)
        self.tabs_container_layout.addWidget(tabs_widget)
        
        prompt_layout.addWidget(img_label)
        search_layout.addWidget(prompt_widget)
        main_layout.addWidget(self.search_section)
        
        # ---------- РЕЗУЛЬТАТЫ ----------
        self.results_section = QWidget()
        self.results_section.setVisible(False)
        results_layout = QVBoxLayout(self.results_section)
        results_layout.setContentsMargins(0, 40, 0, 8)
        results_layout.setSpacing(12)
        
        # Заголовок результатов
        results_header = QWidget()
        results_header_layout = QHBoxLayout(results_header)
        results_header_layout.setContentsMargins(0, 0, 0, 12)
        
        results_title = QLabel("📁 Результаты")
        results_title.setStyleSheet("font-size: 28px; font-weight: 400; color: #fff;")
        results_header_layout.addWidget(results_title)
        
        self.result_badge = QLabel("0 записей")
        self.result_badge.setStyleSheet("""
            QLabel {
                background: #1f1f23;
                color: #a3e635;
                padding: 4px 16px;
                border-radius: 60px;
                font-size: 14px;
            }
        """)
        results_header_layout.addStretch()
        results_header_layout.addWidget(self.result_badge)
        
        results_layout.addWidget(results_header)
        
        # Список результатов
        self.result_grid = QScrollArea()
        self.result_grid.setStyleSheet("""
            QScrollArea {
                background: transparent;
                border: none;
                max-height: 400px;
            }
            QWidget { background: transparent; }
        """)
        self.result_grid.setWidgetResizable(True)
        self.result_grid.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        self.result_container = QWidget()
        self.result_layout = QVBoxLayout(self.result_container)
        self.result_layout.setContentsMargins(0, 0, 0, 0)
        self.result_layout.setSpacing(12)
        
        # Сообщение "Нет результатов"
        self.no_results_label = QLabel("🔍 Выполните поиск, чтобы увидеть данные")
        self.no_results_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.no_results_label.setStyleSheet("""
            QLabel {
                color: #888;
                font-size: 18px;
                padding: 40px 0;
            }
        """)
        self.result_layout.addWidget(self.no_results_label)
        
        self.result_grid.setWidget(self.result_container)
        results_layout.addWidget(self.result_grid)
        
        main_layout.addWidget(self.results_section)
        
        # ---------- ФУТЕР ----------
        footer_widget = QWidget()
        footer_layout = QHBoxLayout(footer_widget)
        footer_layout.setContentsMargins(0, 20, 0, 0)
        footer_layout.setSpacing(12)
        
        copyright_widget = QWidget()
        copyright_widget.setStyleSheet("""
            QWidget {
                background: #171717;
                border-radius: 50px;
            }
        """)
        copyright_layout = QHBoxLayout(copyright_widget)
        copyright_layout.setContentsMargins(18, 6, 18, 6)
        copyright_layout.setSpacing(10)
        
        copyright_labels = [
            ("© 2026 LeakOSINT", None),
            ("GitHub", "https://github.com"),
            ("Telegram", "https://t.me"),
            ("API Docs", "https://telegra.ph/Leakosint-API-Documentation-01-01"),
            ("Получить токен", None)
        ]
        
        for i, (text, link) in enumerate(copyright_labels):
            if i > 0:
                sep = QLabel("•")
                sep.setStyleSheet("color: #a3e635; font-size: 5px;")
                copyright_layout.addWidget(sep)
            
            if link:
                lbl = QLabel(text)
                lbl.setStyleSheet("color: #fff; font-size: 13px;")
                lbl.setCursor(Qt.CursorShape.PointingHandCursor)
                lbl.setProperty("link", link)
                lbl.mousePressEvent = lambda e, url=link: QDesktopServices.openUrl(QUrl(url))
                copyright_layout.addWidget(lbl)
            else:
                lbl = QLabel(text)
                lbl.setStyleSheet("color: #aaa; font-size: 13px;")
                copyright_layout.addWidget(lbl)
        
        footer_layout.addWidget(copyright_widget)
        footer_layout.addStretch()
        
        # Статус
        status_widget = QWidget()
        status_layout = QHBoxLayout(status_widget)
        status_layout.setSpacing(16)
        status_layout.setContentsMargins(0, 0, 0, 0)
        
        self.status_labels = []
        status_items = [
            ("🛡️", "100 бесплатных"),
            ("⚡", "3 req/s"),
        ]
        
        for icon, text in status_items:
            lbl = QLabel(f"{icon} {text}")
            lbl.setStyleSheet("color: #555; font-size: 13px;")
            status_layout.addWidget(lbl)
            self.status_labels.append(lbl)
        
        self.status_indicator = QLabel("● готов")
        self.status_indicator.setStyleSheet("color: #a3e635; font-size: 13px;")
        status_layout.addWidget(self.status_indicator)
        
        footer_layout.addWidget(status_widget)
        main_layout.addWidget(footer_widget)
        
        # ---------- ПОДКЛЮЧЕНИЕ СОБЫТИЙ ----------
        self.search_btn.clicked.connect(self.perform_search)
        self.search_input.returnPressed.connect(self.perform_search)
        
        # Переключение вкладок
        self.search_tab_btn.clicked.connect(lambda: self.switch_tab("search"))
        self.history_tab_btn.clicked.connect(lambda: self.switch_tab("history"))
        self.docs_tab_btn.clicked.connect(lambda: self.switch_tab("docs"))
        
        # Фильтры (визуально)
        for btn in self.filter_btns:
            btn.clicked.connect(self.on_filter_clicked)
        
        # Авто-тест (раскомментировать если нужно)
        # QTimer.singleShot(500, lambda: self.perform_search())
    
    def create_separator(self):
        sep = QLabel()
        sep.setFixedSize(5, 5)
        sep.setStyleSheet("background: #a3e635; border-radius: 3px;")
        return sep
    
    def switch_tab(self, tab_name):
        # Обновляем состояние кнопок
        for btn in [self.search_tab_btn, self.history_tab_btn, self.docs_tab_btn]:
            btn.setChecked(False)
        
        if tab_name == "search":
            self.search_tab_btn.setChecked(True)
            self.results_section.setVisible(True)
            self.search_section.setVisible(True)
            # Показываем результаты, если они есть
        elif tab_name == "history":
            self.history_tab_btn.setChecked(True)
            self.results_section.setVisible(True)
            self.search_section.setVisible(True)
            # Очищаем и показываем историю
            self.clear_results()
            self.show_empty_history()
        elif tab_name == "docs":
            self.docs_tab_btn.setChecked(True)
            QDesktopServices.openUrl(QUrl("https://telegra.ph/Leakosint-API-Documentation-01-01"))
    
    def on_filter_clicked(self):
        for btn in self.filter_btns:
            if btn != self.sender():
                btn.setChecked(False)
        # Меняем плейсхолдер
        filter_id = self.sender().property("filter_id")
        placeholders = {
            "all": "email, логин, телефон или ФИО...",
            "email": "example@domain.com",
            "login": "username или никнейм",
            "phone": "+7 900 123-45-67",
            "name": "Иван Иванов"
        }
        self.search_input.setPlaceholderText(placeholders.get(filter_id, "Введите запрос..."))
    
    def clear_results(self):
        # Очищаем контейнер результатов (сохраняем только no_results)
        while self.result_layout.count():
            item = self.result_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self.result_layout.addWidget(self.no_results_label)
        self.result_badge.setText("0 записей")
    
    def show_empty_history(self):
        self.clear_results()
        self.no_results_label.setText("🕒 История поиска пуста")
        self.no_results_label.setVisible(True)
        self.results_section.setVisible(True)
    
    # ---------- API ЗАПРОС ----------
    def perform_search(self):
        query = self.search_input.text().strip()
        if not query:
            self.clear_results()
            self.no_results_label.setText("⚠️ Введите запрос")
            self.no_results_label.setVisible(True)
            self.results_section.setVisible(True)
            return
        
        # Индикатор загрузки
        self.status_indicator.setText("⏳ запрос...")
        self.status_indicator.setStyleSheet("color: #f1c40f; font-size: 13px;")
        self.clear_results()
        self.no_results_label.setText("⏳ Загрузка данных...")
        self.no_results_label.setVisible(True)
        self.results_section.setVisible(True)
        
        # Запускаем запрос в отдельном потоке
        self.worker = SearchWorker(query)
        self.worker.finished.connect(self.on_search_finished)
        self.worker.error.connect(self.on_search_error)
        self.worker.start()
    
    def on_search_finished(self, data):
        self.status_indicator.setText("● готов")
        self.status_indicator.setStyleSheet("color: #a3e635; font-size: 13px;")
        self.render_results(data)
    
    def on_search_error(self, error_msg):
        self.status_indicator.setText("● ошибка")
        self.status_indicator.setStyleSheet("color: #e74c3c; font-size: 13px;")
        self.clear_results()
        self.no_results_label.setText(f"⚠️ Ошибка: {error_msg}")
        self.no_results_label.setStyleSheet("color: #e74c3c; font-size: 18px; padding: 40px 0;")
        self.no_results_label.setVisible(True)
        self.result_badge.setText("ошибка")
    
    # ---------- ОТРИСОВКА РЕЗУЛЬТАТОВ ----------
    def render_results(self, data):
        # Очищаем контейнер
        while self.result_layout.count():
            item = self.result_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        if not data or "List" not in data:
            self.no_results_label = QLabel("📁 Ничего не найдено")
            self.no_results_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.no_results_label.setStyleSheet("color: #888; font-size: 18px; padding: 40px 0;")
            self.result_layout.addWidget(self.no_results_label)
            self.result_badge.setText("0 записей")
            return
        
        list_data = data["List"]
        if not list_data or len(list_data) == 0:
            self.no_results_label = QLabel("📁 Ничего не найдено")
            self.no_results_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.no_results_label.setStyleSheet("color: #888; font-size: 18px; padding: 40px 0;")
            self.result_layout.addWidget(self.no_results_label)
            self.result_badge.setText("0 записей")
            return
        
        total_records = 0
        
        for db_name, db_data in list_data.items():
            if db_name == "No results found":
                continue
            if "Data" not in db_data or not db_data["Data"]:
                continue
            
            info_leak = db_data.get("InfoLeak", "")
            total_records += len(db_data["Data"])
            
            for item in db_data["Data"]:
                card = QWidget()
                card.setStyleSheet("""
                    QWidget {
                        background: #131316;
                        border-radius: 24px;
                        border-left: 4px solid #a3e635;
                        padding: 16px 20px;
                    }
                    QWidget:hover { background: #1a1a1e; }
                """)
                card_layout = QVBoxLayout(card)
                card_layout.setSpacing(6)
                
                # Название базы
                db_label = QLabel(f"📂 {db_name}")
                db_label.setStyleSheet("color: #a3e635; font-size: 16px; font-weight: 400;")
                card_layout.addWidget(db_label)
                
                # Данные
                data_row = QWidget()
                data_row_layout = QHBoxLayout(data_row)
                data_row_layout.setContentsMargins(0, 0, 0, 0)
                data_row_layout.setSpacing(12)
                data_row_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
                
                for key, value in item.items():
                    if value and str(value).strip():
                        field_label = QLabel(f"<b>{key}:</b> {value}")
                        field_label.setStyleSheet("color: #ddd; font-size: 14px;")
                        field_label.setTextFormat(Qt.TextFormat.RichText)
                        data_row_layout.addWidget(field_label)
                
                data_row_layout.addStretch()
                card_layout.addWidget(data_row)
                
                # Инфо
                if info_leak:
                    info_label = QLabel(info_leak)
                    info_label.setStyleSheet("""
                        QLabel {
                            color: #666;
                            font-size: 12px;
                            border-top: 1px solid rgba(255,255,255,0.03);
                            padding-top: 8px;
                            margin-top: 8px;
                        }
                    """)
                    card_layout.addWidget(info_label)
                
                self.result_layout.addWidget(card)
        
        if total_records == 0:
            self.no_results_label = QLabel("📁 Данные не найдены")
            self.no_results_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.no_results_label.setStyleSheet("color: #888; font-size: 18px; padding: 40px 0;")
            self.result_layout.addWidget(self.no_results_label)
            self.result_badge.setText("0 записей")
        else:
            self.result_badge.setText(f"{total_records} записей")
            # Добавляем stretch в конец
            self.result_layout.addStretch()


# ===================== ПОТОК ДЛЯ ЗАПРОСОВ =====================
class SearchWorker(QThread):
    finished = pyqtSignal(dict)
    error = pyqtSignal(str)
    
    def __init__(self, query):
        super().__init__()
        self.query = query
    
    def run(self):
        try:
            payload = {
                "token": API_TOKEN,
                "request": self.query,
                "limit": 200,
                "lang": "ru"
            }
            
            response = requests.post(API_URL, json=payload, timeout=30)
            
            if response.status_code != 200:
                self.error.emit(f"HTTP {response.status_code}")
                return
            
            data = response.json()
            
            if "Error code" in data:
                self.error.emit(data["Error code"])
                return
            
            self.finished.emit(data)
            
        except requests.exceptions.RequestException as e:
            self.error.emit(str(e))
        except json.JSONDecodeError:
            self.error.emit("Ошибка парсинга ответа")
        except Exception as e:
            self.error.emit(str(e))


# ===================== ЗАПУСК =====================
if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Устанавливаем иконку приложения (опционально)
    app.setStyle("Fusion")
    
    window = LeakOSINTApp()
    window.show()
    
    sys.exit(app.exec())