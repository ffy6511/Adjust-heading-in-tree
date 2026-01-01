(function () {
    const vscode = acquireVsCodeApi();

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "update":
                updateMindmap(message.headings, message.expandedNodes, message.docTitle);
                break;
            case "headingContent":
                {
                    const node = d3.select(`g[data-id="${message.nodeId}"]`);
                    if (node) {
                        node.select("text")
                            .append("tspan")
                            .attr("x", 15)
                            .attr("dy", "1.2em")
                            .text(message.content);
                    }
                }
                break;
        }
    });

    let root;
    let collapsedNodes = new Set();

    function updateMindmap(headings, expandedNodes, docTitle) {
        if (!headings || headings.length === 0) {
            d3.select("#mindmap").selectAll("*").remove();
            return;
        }

        const virtualRoot = {
            id: "__root__",
            label: docTitle || "Mind Map",
            level: 0,
            children: headings,
        };
        root = d3.hierarchy(virtualRoot);

        const allNodeIds = new Set();
        const nodeById = new Map();
        function collectIds(node) {
            allNodeIds.add(node.id);
            nodeById.set(node.id, node);
            if (node.children) {
                node.children.forEach(collectIds);
            }
        }
        collectIds(virtualRoot);

        const expandedNodeSet = new Set(expandedNodes);
        collapsedNodes = new Set(
            [...allNodeIds].filter(id => {
                if (id === "__root__") return false;
                const node = nodeById.get(id);
                const hasChildren = node?.children && node.children.length > 0;
                return hasChildren && !expandedNodeSet.has(id);
            })
        );

        const width = window.innerWidth;
        const height = window.innerHeight;

        const labelWidth = d => Math.min((d.data.label || "").length, 20) * 7;
        const minRowGap = d => 10 + labelWidth(d) / 3;

        const tree = d3.tree()
            .nodeSize([48, 160])
            .separation((a, b) => {
                const base = a.parent === b.parent ? 1 : 1.2;
                const span = Math.max(labelWidth(a), labelWidth(b));
                return base + span / 140;
            })
            .size([height, width - 200]);
        tree(root);

        // 简单纵向防重叠：同一深度按 x 排序并拉开最小间距
        const layers = d3.group(root.descendants(), d => d.depth);
        layers.forEach((nodes) => {
            nodes.sort((a, b) => a.x - b.x);
            let lastX = -Infinity;
            nodes.forEach((node, idx) => {
                if (idx === 0) {
                    lastX = node.x;
                    return;
                }
                const gap = Math.max(minRowGap(node), minRowGap(nodes[idx - 1]));
                if (node.x - lastX < gap) {
                    node.x = lastX + gap;
                }
                lastX = node.x;
            });
        });

        const searchBar = document.getElementById("search-bar");
        if (searchBar) {
            searchBar.oninput = () => {
                render();
            };
        }

        const resetButton = document.getElementById("reset-view");
        if (resetButton) {
            resetButton.onclick = () => {
                d3.select("#mindmap").call(zoom.transform, d3.zoomIdentity);
            };
        }

        const fitButton = document.getElementById("fit-to-window");
        if (fitButton) {
            fitButton.onclick = () => {
                const bounds = d3.select("#mindmap g").node().getBBox();
                const fullWidth = window.innerWidth;
                const fullHeight = window.innerHeight;
                const width = bounds.width;
                const height = bounds.height;
                const midX = bounds.x + width / 2;
                const midY = bounds.y + height / 2;
                if (width === 0 || height === 0) return;
                const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
                const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

                const t = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                d3.select("#mindmap").transition().duration(750).call(zoom.transform, t);
            };
        }

        const backButton = document.getElementById("back-to-toc");
        if (backButton) {
            backButton.onclick = () => {
                vscode.postMessage({
                    type: 'toggleMindmapView'
                });
            };
        }

        const exportPngButton = document.getElementById("export-png");
        if (exportPngButton) {
            exportPngButton.onclick = () => {
                const svg = d3.select("#mindmap").node();
                const svgString = new XMLSerializer().serializeToString(svg);
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const v = canvg.Canvg.fromString(ctx, svgString);
                v.start();
                const dataUrl = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = "mindmap.png";
                a.click();
            };
        }

        const exportSvgButton = document.getElementById("export-svg");
        if (exportSvgButton) {
            exportSvgButton.onclick = () => {
                const svg = d3.select("#mindmap").node();
                const svgString = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgString], { type: "image/svg+xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mindmap.svg";
                a.click();
                URL.revokeObjectURL(url);
            };
        }

        const render = () => {
            d3.select("#mindmap").selectAll("*").remove();

            const filterText = (searchBar?.value ?? "").toLowerCase();
            const filteredNodes = root.descendants().filter(d => {
                if (d.depth === 0) return true; // always keep virtual root
                if (filterText === "") return true;
                return d.data.tags && d.data.tags.some(t => t.toLowerCase().includes(filterText));
            });

            let visibleNodes = filteredNodes.filter(
                d => !d.ancestors().slice(1).some(a => collapsedNodes.has(a.data.id))
            );
            const visibleLinks = root.links().filter(l => visibleNodes.includes(l.source) && visibleNodes.includes(l.target));

            const svg = d3.select("#mindmap")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", "translate(100,0)");

            const palette = [
                "#4dd0e1",
                "#ff9800",
                "#ba68c8",
                "#8bc34a",
                "#ef5350",
                "#cddc39",
                "#7986cb",
                "#26c6da"
            ];
            const colorFor = d => {
                if (d.depth === 0) return "#ff9800";
                const idx = (d.data.level ?? d.depth) % palette.length;
                return palette[idx];
            };

            svg.selectAll(".link")
                .data(visibleLinks)
                .enter().append("path")
                .attr("class", "link")
                .attr("stroke", d => colorFor(d.target))
                .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

            const node = svg.selectAll(".node")
                .data(visibleNodes)
                .enter().append("g")
                .attr("class", d => d.data.tags && d.data.tags.length > 0 ? "node has-tags" : "node")
                .attr("transform", d => `translate(${d.y},${d.x})`)
                .attr("data-id", d => d.data.id)
                .on("click", function(event, d) {
                    if (d.children) {
                        if (collapsedNodes.has(d.data.id)) {
                            collapsedNodes.delete(d.data.id);
                            d3.select(this).select("text").selectAll("tspan").remove();
                        } else {
                            collapsedNodes.add(d.data.id);
                            vscode.postMessage({
                                type: 'getHeadingContent',
                                nodeId: d.data.id
                            });
                        }
                        render();
                    } else {
                        vscode.postMessage({
                            type: 'revealHeading',
                            range: d.data.range
                        });
                    }
                })
                .on("dblclick", function (event, d) {
                    const text = d3.select(this).select("text");
                    const textContent = text.text();
                    text.style("display", "none");

                    const foreignObject = d3.select(this)
                        .append("foreignObject")
                        .attr("width", 200)
                        .attr("height", 30)
                        .attr("x", -100)
                        .attr("y", -15);

                    const input = foreignObject
                        .append("xhtml:input")
                        .attr("type", "text")
                        .style("width", "100%")
                        .style("height", "100%")
                        .attr("value", textContent)
                        .on("blur", function () {
                            const newText = d3.select(this).property("value");
                            text.text(newText);
                            text.style("display", null);
                            foreignObject.remove();
                            vscode.postMessage({
                                type: 'editHeading',
                                nodeId: d.data.id,
                                newText: newText
                            });
                        })
                        .on("keydown", function (event) {
                            if (event.key === "Enter") {
                                d3.select(this).dispatch("blur");
                            }
                        });

                    input.node().focus();
                });

            const circleRadius = 6;
            node.append("circle")
                .attr("r", circleRadius)
                .attr("fill", d => {
                    if (d.depth === 0) return "#1f2937";
                    return collapsedNodes.has(d.data.id) ? "#374151" : colorFor(d);
                });

            node.append("text")
                .attr("dy", -circleRadius - 6)
                .attr("text-anchor", "middle")
                .text(d => d.data.label.length > 20 ? d.data.label.substring(0, 20) + "..." : d.data.label);

            node.filter(d => d.data.tags && d.data.tags.length > 0)
                .append("text")
                .attr("dy", circleRadius + 10)
                .attr("text-anchor", "middle")
                .style("font-size", "10px")
                .style("fill", "#a0aec0")
                .text(d => d.data.tags.join(', '));
        };

        const zoom = d3.zoom().on("zoom", (event) => {
            d3.select("#mindmap g").attr("transform", event.transform);
        });

        d3.select("#mindmap").call(zoom);

        render();
    }
})();
