import numpy as np
import random
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle
import matplotlib.colors as mcolors

RANDOM_MEJA = 0.2

class Avto:
    """predstavlja avto v modelu"""
    def __init__(self, poz, pas=0, hitrost=0, max_hitrost=5):
        self.poz = poz          # index celice
        self.hitrost = hitrost
        self.pas = pas
        self.max_hitrost = max_hitrost
        # self.color = random.choice(['red', 'blue', 'green', 'orange', 'purple', 'brown'])


    def update_hitrost(self, razdalja, p_zaviranje):
        """sprejme razdaljo do naslednjega avta in temu ustrezno spremeni hitrost"""
        # pospeševanje do maksimalne hitrosti
        hitrost = self.hitrost
        if hitrost < self.max_hitrost:
            hitrost += 1

        # premakneš se lahko največ do avta spredaj
        if razdalja:
            hitrost = min(hitrost, razdalja)

        # naključno zaviranje
        p = random.uniform(0, 1)
        if p < p_zaviranje and hitrost > 0: 
            hitrost -= 1

        self.hitrost = hitrost

    # def update_pozicija(self, razdalja):
    #     """sprejme razdaljo do naslednjega avta in temu ustrezno spremeni pozicijo"""
    #     self.poz = (self.poz + self.hitrost) % dolzina_ceste
    #     return self.poz

class Cesta:
    def __init__(self, st_pasov = 3, dolzina_ceste=100, gostota=0.05, max_hitrost=5, p_zaviranje=0.3):
        self.dolzina_ceste = dolzina_ceste
        self.cesta = [[None] * dolzina_ceste for _ in range(st_pasov)]
        self.max_hitrost = max_hitrost
        self.st_pasov = st_pasov
        self.p_zaviranje = p_zaviranje
        gostota = gostota / st_pasov
        
        self.avti = []
        for pas in range(st_pasov):
            for i in range(dolzina_ceste):  # Random postavitev avtov
                if random.random() < gostota and self.cesta[pas][i] is None:
                    avto = Avto(i, pas=pas, max_hitrost=max_hitrost)
                    self.avti.append(avto)
                    self.cesta[pas][i] = avto

    def razdalja_do_naslednjega(self, pas, pozicija):
        """Izračuna razdaljo do naslednjega avtomobila"""
        razdalja = 1
        while self.cesta[pas][(pozicija + razdalja) % self.dolzina_ceste] is None: #ce je prazno mesto
            razdalja += 1
            if razdalja > self.dolzina_ceste:  #za vsak slučaj
                break
        return razdalja - 1  #povečamo preden preverimo za naslednjo mesto
    
    def razdalja_do_prejsnjega(self, pas, pozicija):
        """Izračuna razdaljo do prejšnjega avtomobila zadaj"""
        razdalja = 1
        while self.cesta[pas][(pozicija - razdalja) % self.dolzina_ceste] is None:
            razdalja += 1
            if razdalja > self.dolzina_ceste:
                break
        return razdalja - 1

    def korak_simulacije(self):
        """En korak simulacije"""
        # print("Posodabljam \n")
        # 1. Posodobitev hitrosti
        for avto in self.avti:
            razdalja = self.razdalja_do_naslednjega(avto.pas, avto.poz)
            # print(f"Do naslednjega avta je {razdalja}")
            avto.update_hitrost(razdalja, self.p_zaviranje)
            # print(f"Premaknil se bom za {avto.hitrost}")
            # print("\n")
        
        # 1b. Možna sprememba pasu
        lane_changes = []
        for avto in self.avti:
            novi_pas = should_change_lane(self, avto)
            if novi_pas is not None and self.cesta[novi_pas][avto.poz] is None:
                lane_changes.append((avto, novi_pas))
        for avto, novi_pas in lane_changes:
            self.cesta[avto.pas][avto.poz] = None
            avto.pas = novi_pas
            self.cesta[avto.pas][avto.poz] = avto

        # 2. Premikanje avtomobilov
        nova_cesta = [[None] * self.dolzina_ceste for _ in range(self.st_pasov)]
        for avto in self.avti:
            nova_pozicija = (avto.poz + avto.hitrost) % self.dolzina_ceste
            avto.poz = nova_pozicija
            nova_cesta[avto.pas][nova_pozicija] = avto
        
        self.cesta = nova_cesta
    

def should_change_lane(cesta, avto, safe_gap_front=2, safe_gap_back=1):
    """Preprosta strategija za odločanje o menjavi pasu."""
    if cesta.st_pasov < 2:
        return None
    
    razdalja_spredaj = cesta.razdalja_do_naslednjega(avto.pas, avto.poz)
    if razdalja_spredaj > safe_gap_front:
        return None
    
    for smer in (-1, 1): #lahko gre v obe smeri
        novi_pas = avto.pas + smer
        if novi_pas < 0 or novi_pas >= cesta.st_pasov:
            continue
        if cesta.cesta[novi_pas][avto.poz] is not None:
            continue
        
        razdalja_pred = cesta.razdalja_do_naslednjega(novi_pas, avto.poz)
        razdalja_zadaj = cesta.razdalja_do_prejsnjega(novi_pas, avto.poz)
        
        if razdalja_pred >= safe_gap_front and razdalja_zadaj >= safe_gap_back:
            return novi_pas
    
    return None


def simple_vizualiziraj_simulacijo(model, koraki=50):
    """Vizualizira simulacijo"""
    stanja = []
    
    for _ in range(koraki):
        stanje = []
        for pas in range(model.st_pasov):
            stanje.extend(1 if avto is not None else 0 for avto in model.cesta[pas])
        stanja.append(stanje)
        model.korak_simulacije()
    
    plt.figure(figsize=(12, 8))
    plt.imshow(stanja, cmap='binary', aspect='auto')
    plt.xlabel('Pozicija na cesti')
    plt.ylabel('Čas (koraki)')
    plt.title('Nagel-Schreckenberg model prometa')
    plt.colorbar(label='Prisotnost avtomobila')
    plt.show()

# vizualiziraj_simulacijo(Cesta(dolzina_ceste=20), koraki=10)


def vizualizacija_kroga(model, koraki=100):
    """Krožna vizualizacija prometa"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 7))
    
    # Nastavitev kroga
    center_radius = 5
    lane_spacing = 0.6
    center = (0, 0)
    
    def lane_offset(pas):
        """Vrne odmik posameznega pasu relativno na srednjo krožnico."""
        return (pas - (model.st_pasov - 1) / 2) * lane_spacing
    
    def pozicija_na_krogu(pozicija, total, pas):
        """Pretvori linearno pozicijo v točko na izbranem pasu na krogu"""
        angle = 2 * np.pi * pozicija / total
        radius = center_radius + lane_offset(pas)
        x = radius * np.cos(angle)
        y = radius * np.sin(angle)
        return x, y, angle
    
    # Priprava za animacijo
    scatter = ax1.scatter([], [], s=100, alpha=0.7)
    
    # Nastavitev krožne ceste (en krog na pas)
    max_offset = lane_offset(model.st_pasov - 1) if model.st_pasov > 1 else 0
    min_offset = lane_offset(0) if model.st_pasov > 1 else 0
    outer_radius = center_radius + max_offset + lane_spacing / 2
    inner_radius = center_radius + min_offset - lane_spacing / 2
    inner_radius = max(inner_radius, 0.5)
    
    outer_circle = Circle(center, outer_radius, fill=False, edgecolor='gray', linewidth=2)
    inner_circle = Circle(center, inner_radius, fill=False, edgecolor='gray', linewidth=2)
    ax1.add_patch(outer_circle)
    ax1.add_patch(inner_circle)
    
    # Dodaj vmesne črte med pasovi
    for idx in range(1, model.st_pasov):
        radius = center_radius + lane_offset(idx - 0.5)
        ax1.add_patch(Circle(center, radius, fill=False, edgecolor='gray', linewidth=1, linestyle='--'))
    
    plot_radius = max(outer_radius, inner_radius)
    ax1.set_xlim(-plot_radius-1, plot_radius+1)
    ax1.set_ylim(-plot_radius-1, plot_radius+1)
    ax1.set_aspect('equal')
    ax1.set_title('Krožna vizualizacija prometa\n(Barva = hitrost)', fontsize=14)
    ax1.grid(True, alpha=0.3)
    
    # Priprava časovnega grafa
    časovna_os = list(range(koraki))
    povprecne_hitrosti = []
    ax2.set_xlim(0, koraki)
    ax2.set_ylim(0, model.max_hitrost + 1)
    ax2.set_xlabel('Čas (koraki)')
    ax2.set_ylabel('Povprečna hitrost')
    ax2.set_title('Razvoj hitrosti skozi čas')
    ax2.grid(True, alpha=0.3)
    line, = ax2.plot([], [], 'b-', linewidth=2)
    
    def init():
        scatter.set_offsets(np.empty((0, 2)))
        line.set_data([], [])
        return scatter, line
    
    def update(frame):
        # Izvedi korak simulacije
        if frame == 0:
            povprecne_hitrosti.clear()
        if frame > 0:
            model.korak_simulacije()
        
        # Prikaži avte na krogu
        pozicije = []
        barve = []
        hitrosti = []
        
        for avto in model.avti:
            x, y, kot = pozicija_na_krogu(avto.poz, model.dolzina_ceste, avto.pas)
            pozicije.append([x, y])
            hitrosti.append(avto.hitrost)
            # Barva glede na hitrost
            barva = plt.cm.viridis(avto.hitrost / model.max_hitrost)
            barve.append(barva)
        
        scatter.set_offsets(pozicije)
        scatter.set_color(barve)
        scatter.set_sizes([80 + hitrost * 20 for hitrost in hitrosti])  # Velikost glede na hitrost
        
        # Posodobi časovni graf
        povprecna_hitrost = np.mean(hitrosti) if hitrosti else 0
        povprecne_hitrosti.append(povprecna_hitrost)
        
        line.set_data(časovna_os[:frame+1], povprecne_hitrosti)
        
        # Posodobi naslov s statistiko
        ax1.set_title(f'Krožna vizualizacija prometa\n'
                     f'Korak: {frame}, Avti: {len(model.avti)}, '
                     f'Povprečna hitrost: {povprecna_hitrost:.2f}', fontsize=12)
        
        return scatter, line
    
    # Ustvari animacijo
    anim = FuncAnimation(fig, update, frames=koraki, 
                        init_func=init, blit=True, interval=200, repeat=True)
    
    plt.tight_layout()
    plt.show()
    
    return anim

# TESTIRAJ
print("=== KROŽNA VIZUALIZACIJA ===")
model = Cesta(dolzina_ceste=60, gostota=0.3, max_hitrost=5, p_zaviranje=0.2)

# Animacija
print("Zaženem animacijo...")
anim = vizualizacija_kroga(model, koraki=100)
