(function () {
    const vscode = acquireVsCodeApi();

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "update":
                updateMindmap(message.headings, message.expandedNodes);
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

    function updateMindmap(headings, expandedNodes) {
        if (!headings || headings.length === 0) {
            d3.select("#mindmap").selectAll("*").remove();
            return;
        }

        const allNodeIds = new Set();
        function collectIds(node) {
            allNodeIds.add(node.id);
            if (node.children) {
                node.children.forEach(collectIds);
            }
        }
        headings.forEach(collectIds);

        const expandedNodeSet = new Set(expandedNodes);
        collapsedNodes = new Set([...allNodeIds].filter(id => !expandedNodeSet.has(id)));

        if (headings.length > 1) {
            root = d3.hierarchy({
                label: "Root",
                children: headings,
            });
        } else {
            root = d3.hierarchy(headings[0]);
        }
        const width = window.innerWidth;
        const height = window.innerHeight;

        const tree = d3.tree().size([height, width - 200]);
        tree(root);

        const svg = d3.select("#mindmap")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", "translate(100,0)");

        const link = svg.selectAll(".link")
            .data(root.descendants().slice(1))
            .enter().append("path")
            .attr("class", "link")
            .attr("d", d => {
                return "M" + d.y + "," + d.x
                    + "C" + (d.y + d.parent.y) / 2 + "," + d.x
                    + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            });

        const searchBar = document.getElementById("search-bar");
        searchBar.addEventListener("input", () => {
            render();
        });

        const resetButton = document.getElementById("reset-view");
        resetButton.addEventListener("click", () => {
            d3.select("#mindmap").call(zoom.transform, d3.zoomIdentity);
        });

        const fitButton = document.getElementById("fit-to-window");
        fitButton.addEventListener("click", () => {
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
        });

        const backButton = document.getElementById("back-to-toc");
        backButton.addEventListener("click", () => {
            vscode.postMessage({
                type: 'toggleMindmapView'
            });
        });

        const exportPngButton = document.getElementById("export-png");
        exportPngButton.addEventListener("click", () => {
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
        });

        const exportSvgButton = document.getElementById("export-svg");
        exportSvgButton.addEventListener("click", () => {
            const svg = d3.select("#mindmap").node();
            const svgString = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgString], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "mindmap.svg";
            a.click();
            URL.revokeObjectURL(url);
        });

        const render = () => {
            d3.select("#mindmap").selectAll("*").remove();

            const filterText = searchBar.value.toLowerCase();
            const filteredNodes = root.descendants().filter(d => {
                if (filterText === "") return true;
                return d.data.tags && d.data.tags.some(t => t.toLowerCase().includes(filterText));
            });

            let visibleNodes = filteredNodes.filter(d => !d.ancestors().some(a => collapsedNodes.has(a.data.id)));
            if (headings.length > 1) {
                visibleNodes = visibleNodes.filter(d => d.depth > 0);
            }
            const visibleLinks = root.links().filter(l => visibleNodes.includes(l.source) && visibleNodes.includes(l.target));

            const svg = d3.select("#mindmap")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", "translate(100,0)");

            svg.selectAll(".link")
                .data(visibleLinks)
                .enter().append("path")
                .attr("class", "link")
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
                            // Remove content preview
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

            const nodePadding = 10;
            node.append("text")
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .text(d => d.data.label.length > 20 ? d.data.label.substring(0, 20) + "..." : d.data.label)
                .each(function (d) {
                    const bbox = this.getBBox();
                    d.bbox = bbox;
                });

            node.insert("rect", "text")
                .attr("x", d => d.bbox.x - nodePadding)
                .attr("y", d => d.bbox.y - nodePadding)
                .attr("width", d => d.bbox.width + 2 * nodePadding)
                .attr("height", d => d.bbox.height + 2 * nodePadding)
                .attr("rx", 5)
                .attr("ry", 5)
                .style("fill", d => {
                    if (collapsedNodes.has(d.data.id)) return "#ccc";
                    return `hsl(${d.data.level * 60}, 70%, 50%)`;
                });

            node.filter(d => d.data.tags && d.data.tags.length > 0)
                .append("text")
                .attr("dy", "1.5em")
                .attr("x", d => d.children ? -13 : 13)
                .style("text-anchor", d => d.children ? "end" : "start")
                .style("font-size", "10px")
                .style("fill", "#888")
                .text(d => d.data.tags.join(', '));
        };

        const zoom = d3.zoom().on("zoom", (event) => {
            d3.select("#mindmap g").attr("transform", event.transform);
        });

        d3.select("#mindmap").call(zoom);

        render();
    }
})();
