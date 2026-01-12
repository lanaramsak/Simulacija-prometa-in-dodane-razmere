from flask import Flask, jsonify, request, render_template

from src.tools import Cesta

app = Flask(__name__)

model = None


def serialize_state():
    # Model v JSON
    if model is None:
        return {
            "dolzina_ceste": 0,
            "st_pasov": 0,
            "avti": [],
            "ovire": [],
            "omejitve": [],
            "lookahead": 0,
            "truck_cap_enabled": False,
        }

    avti = [
        {
            "poz": avto.poz,
            "pas": avto.pas,
            "hitrost": avto.hitrost,
            "max_hitrost": avto.max_hitrost,
            "tip": avto.tip,
            "dolzina": avto.dolzina,
            "color": avto.color,
        }
        for avto in model.avti
    ]
    ovire = [
        {
            "poz": ovira.poz,
            "pas": ovira.pas,
        }
        for ovira in model.ovire
    ]
    omejitve = getattr(model, "cesta_omejitve", [])
    return {
        "dolzina_ceste": model.dolzina_ceste,
        "st_pasov": model.st_pasov,
        "avti": avti,
        "ovire": ovire,
        "omejitve": omejitve,
        "lookahead": model.lookahead,
        "truck_cap_enabled": model.truck_cap_enabled,
    }


@app.get("/")
def index():
    #Glavna HTML stran
    return render_template("index.html")


@app.get("/state")
def state():
    # korak slika simulaije
    return jsonify(serialize_state())


@app.post("/init")
def init():
    # Nardimo nov model (aka cesta, omejitve, ovire)
    global model
    data = request.get_json(force=True)
    dolzina_ceste = int(data.get("dolzina_ceste", 200))
    p_zaviranje = float(data.get("p_zaviranje", 0.2))
    omejitve = data.get("omejitve", [])
    ovire = data.get("ovire", [])
    lookahead = int(data.get("lookahead", 15))  # koliko celic naprej gledajo avti
    truck_cap_enabled = bool(data.get("truck_cap_enabled", False))

    model = Cesta(
        dolzina_ceste=dolzina_ceste,
        p_zaviranje=p_zaviranje,
        omejitve=omejitve,
        lookahead=lookahead,
    )
    model.set_truck_cap(truck_cap_enabled, max_speed=4)

    # Dodatne ovire - dodala ker jih je prej prepisal
    for ovira in ovire:
        model.add_obstacle(int(ovira.get("poz", 0)), int(ovira.get("pas", 0)))

    # Random avti
    if data.get("random_vozila", False):
        gostota = float(data.get("gostota", 0.1))
        max_hitrost_interval = data.get("max_hitrost_interval")
        if max_hitrost_interval:
            max_hitrost_interval = (
                int(max_hitrost_interval[0]),
                int(max_hitrost_interval[1]),
            )
        model.random_vozila(
            gostota=gostota,
            max_hitrost_interval=max_hitrost_interval,
        )
    elif data.get("random", False):
        gostota = float(data.get("gostota", 0.1))
        max_hitrost_interval = data.get("max_hitrost_interval")
        if max_hitrost_interval:
            max_hitrost_interval = (
                int(max_hitrost_interval[0]),
                int(max_hitrost_interval[1]),
            )
        model.random_cars(
            gostota=gostota,
            max_hitrost_interval=max_hitrost_interval,
        )

    return jsonify({"ok": True})


@app.post("/set_limits")
def set_limits():
    # Omejitev hitrosti posodobljena ko dodaš
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    omejitve = data.get("omejitve", [])
    model.set_omejitve(omejitve)
    return jsonify({"ok": True})


@app.post("/set_lookahead")
def set_lookahead():
    # Nastavi koliko celic naprej avti gledajo
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    lookahead = int(data.get("lookahead", 15))
    model.lookahead = lookahead
    return jsonify({"ok": True})


@app.post("/set_truck_cap")
def set_truck_cap():
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    enabled = bool(data.get("enabled", False))
    max_speed = int(data.get("max_speed", 4))
    model.set_truck_cap(enabled, max_speed=max_speed)
    return jsonify({"ok": True})


@app.post("/add_vozilo")
def add_vozilo():
    # Dodan avto v model
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    poz = int(data.get("poz", 0))
    pas = int(data.get("pas", 0))
    max_hitrost = int(data.get("max_hitrost", 5))
    tip = data.get("tip", "avto")
    color = data.get("color")
    ok = model.add_vozilo(poz, pas, max_hitrost, color=color, tip=tip)
    return jsonify({"ok": ok})


@app.post("/add_obstacle")
def add_obstacle():
    # Dodana ovira v model.
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    poz = int(data.get("poz", 0))
    pas = int(data.get("pas", 0))
    model.add_obstacle(poz, pas)
    return jsonify({"ok": True})

@app.post("/remove_obstacle")
def remove_obstacle():
    # Odstrani oviro s ceste.
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    start = int(data.get("poz", 0))
    pas = int(data.get("pas", 0))
    dolzina = int(data.get("len", 1))
    ok = False
    for i in range(max(dolzina, 1)):
        poz = (start + i) % model.dolzina_ceste
        ok = model.remove_obstacle(poz, pas) or ok
    return jsonify({"ok": ok})


@app.post("/step")
def step():
    # Izvede n korakov simulacije in vrne OK
    data = request.get_json(force=True)
    if model is None:
        return jsonify({"ok": False, "error": "Model not initialized"}), 400

    n = int(data.get("n", 1))
    for _ in range(max(n, 1)):
        model.korak_simulacije()

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)
