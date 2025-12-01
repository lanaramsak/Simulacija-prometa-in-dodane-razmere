import numpy as np
import random
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle
import matplotlib.colors as mcolors

RANDOM_MEJA = 0.2

class Avto:
    """predstavlja avto v modelu"""
    def __init__(self, poz, hitrost=0, max_hitrost=5):
        self.poz = poz          # index celice
        self.hitrost = hitrost
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
    def __init__(self, dolzina_ceste=100, gostota=0.2, max_hitrost=5, p_zaviranje=0.3):
        self.dolzina_ceste = dolzina_ceste
        self.cesta = [None] * dolzina_ceste
        self.max_hitrost = max_hitrost
        self.p_zaviranje = p_zaviranje
        
        self.avti = []
        for i in range(dolzina_ceste): #Random postavitev avtov
            if random.random() < gostota:
                self.avti.append(Avto(i, max_hitrost=max_hitrost))
                self.cesta[i] = self.avti[-1]

    def razdalja_do_naslednjega(self, pozicija):
        """Izračuna razdaljo do naslednjega avtomobila"""
        razdalja = 1
        while self.cesta[(pozicija + razdalja) % self.dolzina_ceste] is None: #ce je prazno mesto
            razdalja += 1
            if razdalja > self.dolzina_ceste:  #za vsak slučaj
                break
        return razdalja - 1  #povečamo preden preverimo za naslednjo mesto

    def korak_simulacije(self):
        """En korak simulacije"""
        # print("Posodabljam \n")
        # 1. Posodobitev hitrosti
        for avto in self.avti:
            razdalja = self.razdalja_do_naslednjega(avto.poz)
            # print(f"Do naslednjega avta je {razdalja}")
            avto.update_hitrost(razdalja, self.p_zaviranje)
            # print(f"Premaknil se bom za {avto.hitrost}")
            # print("\n")

        # 2. Premikanje avtomobilov
        nova_cesta = [None] * self.dolzina_ceste
        for avto in self.avti:
            nova_pozicija = (avto.poz + avto.hitrost) % self.dolzina_ceste
            avto.poz = nova_pozicija
            nova_cesta[nova_pozicija] = avto
        
        self.cesta = nova_cesta
    

def simple_vizualiziraj_simulacijo(model, koraki=50):
    """Vizualizira simulacijo"""
    stanja = []
    
    for _ in range(koraki):
        stanje = [1 if avto is not None else 0 for avto in model.cesta]
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
    radius = 5
    center = (0, 0)
    
    def pozicija_na_krogu(pozicija, total):
        """Pretvori linearno pozicijo v kot na krogu"""
        angle = 2 * np.pi * pozicija / total
        x = radius * np.cos(angle)
        y = radius * np.sin(angle)
        return x, y, angle
    
    # Priprava za animacijo
    scatter = ax1.scatter([], [], s=100, alpha=0.7)
    
    # Nastavitev krožne ceste
    circle = Circle(center, radius, fill=False, edgecolor='gray', linewidth=2, linestyle='--')
    ax1.add_patch(circle)
    
    ax1.set_xlim(-radius-1, radius+1)
    ax1.set_ylim(-radius-1, radius+1)
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
        if frame > 0:
            model.korak_simulacije()
        
        # Prikaži avte na krogu
        pozicije = []
        barve = []
        hitrosti = []
        
        for avto in model.avti:
            x, y, kot = pozicija_na_krogu(avto.poz, model.dolzina_ceste)
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
