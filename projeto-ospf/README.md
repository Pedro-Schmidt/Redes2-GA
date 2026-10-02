# OSPF

`sudo docker pull frrouting/frr`

## Crie containers para cada roteador:

`sudo docker create -it --privileged --name R1 frrouting/frr /bin/bash`

`sudo docker create -it --privileged --name R2 frrouting/frr /bin/bash`

`sudo docker create -it --privileged --name R3 frrouting/frr /bin/bash`

`sudo docker create -it --privileged --name R4 frrouting/frr /bin/bash`

`sudo docker create -it --privileged --name R5 frrouting/frr /bin/bash`

## Crie as redes:

`sudo docker network create --driver bridge --subnet 10.0.12.0/29 R1paraR2`

`sudo docker network create --driver bridge --subnet 10.0.13.0/29 R1paraR3`

`sudo docker network create --driver bridge --subnet 10.0.23.0/29 R2paraR3`

`sudo docker network create --driver bridge --subnet 10.0.24.0/29 R2paraR4`

`sudo docker network create --driver bridge --subnet 10.0.35.0/29 R3paraR5`

`sudo docker network create --driver bridge --subnet 10.0.45.0/29 R4paraR5 `

## Conectar as redes

`sudo docker network connect R1paraR2 R1`

`sudo docker network connect R1paraR2 R2`

`sudo docker network connect R1paraR3 R1`

`sudo docker network connect R1paraR3 R3`

`sudo docker network connect R2paraR3 R2`

`sudo docker network connect R2paraR3 R3`

`sudo docker network connect R2paraR4 R2`

`sudo docker network connect R2paraR4 R4`

`sudo docker network connect R3paraR5 R3`

`sudo docker network connect R3paraR5 R5`

`sudo docker network connect R4paraR5 R4`

`sudo docker network connect R4paraR5 R5`

## Configurar

Rode esse comando, só mude o RX para o nome do container

`sudo docker exec -it --privileged RX /bin/bash`

Feito isso você estará dentro do container.

### Em cada container, realize os comandos abaixo:

`ip link add lan1 type bridge`

Substitua IP_LAN pelo ip da LAN e MASCARA_LAN pela sua máscara de rede

`ifconfig lan1 IP_LAN netmask MASCARA_LAN`

Rode esses comandos

`sed -i '/ospfd=no/c\ospfd=yes' /etc/frr/daemons`

`/etc/init.d/frr stop`

`/usr/lib/frr/watchfrr -d -F traditional zebra ospfd staticd`

Após rode:

`vtysh`

`configure terminal`

`router ospf`

E depois configure o OSPF, onde para cada rota, digite o seguinte comando, onde RANGE_IP é a faixa de ips alocada:

`network RANGE_IP area 0`

Após rode:

`do write memory`

E é isso!
